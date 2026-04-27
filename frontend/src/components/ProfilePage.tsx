import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, clearStoredToken, parseStoredUser } from '../api'
import { Icon } from './Icon'

type UserType = 'member' | 'recruiter'

interface MeResponse {
  user_type: UserType
  user_id: number
  email: string
  profile: Record<string, unknown>
}

interface SaveResponse {
  success: boolean
  message: string
  data?: Record<string, unknown>
}

interface ProfilePageProps {
  onAuthChange?: () => void
}

// ── Client-side image resize → JPEG data URL ──────────────────────────────────
const MAX_PHOTO_DIMENSION = 512
const PHOTO_JPEG_QUALITY = 0.85

function fileToResizedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select an image file (JPEG, PNG, or WEBP).'))
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('Image must be smaller than 8 MB.'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode image.'))
      img.onload = () => {
        const ratio = Math.min(
          1,
          MAX_PHOTO_DIMENSION / img.width,
          MAX_PHOTO_DIMENSION / img.height,
        )
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas not supported in this browser.'))
          return
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

// ── Member form state ─────────────────────────────────────────────────────────

interface MemberState {
  first_name: string
  last_name: string
  headline: string
  about: string
  phone: string
  location_city: string
  location_state: string
  location_country: string
  skills: string        // comma-separated
  resume_text: string
  profile_photo_url: string
}

const EMPTY_MEMBER: MemberState = {
  first_name: '',
  last_name: '',
  headline: '',
  about: '',
  phone: '',
  location_city: '',
  location_state: '',
  location_country: '',
  skills: '',
  resume_text: '',
  profile_photo_url: '',
}

function memberFromProfile(p: Record<string, unknown>): MemberState {
  const skills = Array.isArray(p.skills) ? (p.skills as unknown[]).map(String) : []
  return {
    first_name: String(p.first_name ?? ''),
    last_name: String(p.last_name ?? ''),
    headline: String(p.headline ?? ''),
    about: String(p.about ?? ''),
    phone: String(p.phone ?? ''),
    location_city: String(p.location_city ?? ''),
    location_state: String(p.location_state ?? ''),
    location_country: String(p.location_country ?? ''),
    skills: skills.join(', '),
    resume_text: String(p.resume_text ?? ''),
    profile_photo_url: String(p.profile_photo_url ?? ''),
  }
}

// ── Recruiter form state ──────────────────────────────────────────────────────

interface RecruiterState {
  first_name: string
  last_name: string
  phone: string
  company_name: string
  company_industry: string
  company_size: string
  role: string
}

const EMPTY_RECRUITER: RecruiterState = {
  first_name: '',
  last_name: '',
  phone: '',
  company_name: '',
  company_industry: '',
  company_size: '',
  role: '',
}

function recruiterFromProfile(p: Record<string, unknown>): RecruiterState {
  return {
    first_name: String(p.first_name ?? ''),
    last_name: String(p.last_name ?? ''),
    phone: String(p.phone ?? ''),
    company_name: String(p.company_name ?? ''),
    company_industry: String(p.company_industry ?? ''),
    company_size: String(p.company_size ?? ''),
    role: String(p.role ?? ''),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProfilePage({ onAuthChange }: ProfilePageProps) {
  const storedUser = parseStoredUser()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [userType, setUserType] = useState<UserType | null>(storedUser?.user_type ?? null)
  const [userId, setUserId] = useState<number | null>(storedUser?.user_id ?? null)
  const [email, setEmail] = useState<string>(storedUser?.email ?? '')

  const [member, setMember] = useState<MemberState>(EMPTY_MEMBER)
  const [recruiter, setRecruiter] = useState<RecruiterState>(EMPTY_RECRUITER)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const me = await apiGet<MeResponse>('/auth/me')
      setUserType(me.user_type)
      setUserId(me.user_id)
      setEmail(me.email)
      if (me.user_type === 'member') {
        setMember(memberFromProfile(me.profile))
      } else {
        setRecruiter(recruiterFromProfile(me.profile))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  // Auto-clear toast after 3s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const handlePickPhoto = () => fileInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting same file
    if (!file || userType !== 'member' || userId == null) return

    setUploading(true)
    setError(null)
    try {
      const dataUrl = await fileToResizedDataUrl(file)
      // Optimistically update preview
      setMember((m) => ({ ...m, profile_photo_url: dataUrl }))
      // Persist immediately so it survives reload even without Save
      const res = await apiPost<SaveResponse>('/members/update', {
        member_id: userId,
        profile_photo_url: dataUrl,
      })
      if (!res.success) throw new Error(res.message || 'Upload failed')
      setToast('Profile photo updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleRemovePhoto = async () => {
    if (userType !== 'member' || userId == null) return
    setUploading(true)
    setError(null)
    try {
      const res = await apiPost<SaveResponse>('/members/update', {
        member_id: userId,
        profile_photo_url: '',
      })
      if (!res.success) throw new Error(res.message || 'Could not remove photo')
      setMember((m) => ({ ...m, profile_photo_url: '' }))
      setToast('Photo removed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (userId == null || userType == null) return
    setSaving(true)
    setError(null)
    try {
      if (userType === 'member') {
        const skills = member.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const res = await apiPost<SaveResponse>('/members/update', {
          member_id: userId,
          first_name: member.first_name.trim(),
          last_name: member.last_name.trim(),
          headline: member.headline,
          about: member.about,
          phone: member.phone,
          location_city: member.location_city,
          location_state: member.location_state,
          location_country: member.location_country,
          skills,
          resume_text: member.resume_text,
        })
        if (!res.success) throw new Error(res.message || 'Save failed')
      } else {
        const res = await apiPost<SaveResponse>('/recruiters/update', {
          recruiter_id: userId,
          first_name: recruiter.first_name.trim(),
          last_name: recruiter.last_name.trim(),
          phone: recruiter.phone,
          company_name: recruiter.company_name,
          company_industry: recruiter.company_industry,
          company_size: recruiter.company_size,
          role: recruiter.role,
        })
        if (!res.success) throw new Error(res.message || 'Save failed')
      }
      setToast('Profile saved')
      onAuthChange?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Guest state
  if (userId == null || userType == null) {
    return (
      <section className="panel">
        <div className="profile-guest">
          <h2 className="panel-title">Your profile</h2>
          <p className="panel-subtitle">
            Sign in to view and edit your profile details.
          </p>
        </div>
      </section>
    )
  }

  if (loading) {
    return (
      <section className="panel">
        <div className="profile-loading">Loading profile…</div>
      </section>
    )
  }

  const displayName =
    userType === 'member'
      ? `${member.first_name} ${member.last_name}`.trim() || email
      : `${recruiter.first_name} ${recruiter.last_name}`.trim() || email

  const initials =
    userType === 'member'
      ? `${member.first_name[0] ?? ''}${member.last_name[0] ?? ''}`.toUpperCase() || email[0]?.toUpperCase()
      : `${recruiter.first_name[0] ?? ''}${recruiter.last_name[0] ?? ''}`.toUpperCase() || email[0]?.toUpperCase()

  return (
    <section className="panel profile-panel">
      {/* Header card */}
      <div className="profile-hero-card">
        <div className="profile-hero-top">
          <div className="profile-avatar-slot">
            {userType === 'member' && member.profile_photo_url ? (
              <img
                src={member.profile_photo_url}
                alt={displayName}
                className="profile-avatar-img"
              />
            ) : (
              <div className="profile-avatar-fallback">{initials}</div>
            )}
            {userType === 'member' && (
              <button
                type="button"
                className="profile-avatar-edit"
                onClick={handlePickPhoto}
                disabled={uploading}
                title="Change profile photo"
              >
                <Icon name="add" size={16} />
              </button>
            )}
          </div>

          <div className="profile-hero-meta">
            <h1 className="profile-hero-name">{displayName}</h1>
            <p className="profile-hero-headline">
              {userType === 'member'
                ? member.headline || 'Add a professional headline'
                : recruiter.company_name || 'Add your company details'}
            </p>
            <div className="profile-hero-chips">
              <span className="profile-chip profile-chip-role">{userType}</span>
              <span className="profile-chip">{email}</span>
              <span className="profile-chip">ID #{userId}</span>
            </div>
          </div>

          <button
            type="button"
            className="profile-signout-btn"
            onClick={() => {
              clearStoredToken()
              onAuthChange?.()
            }}
            title="Sign out"
          >
            Sign out
          </button>
        </div>

        {userType === 'member' && (
          <div className="profile-photo-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={handlePickPhoto}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : member.profile_photo_url ? 'Change photo' : 'Upload photo'}
            </button>
            {member.profile_photo_url && (
              <button
                type="button"
                className="ghost-btn"
                onClick={handleRemovePhoto}
                disabled={uploading}
              >
                Remove photo
              </button>
            )}
            <span className="profile-photo-hint">
              JPEG or PNG, up to 8 MB. Resized to 512px for fast loading.
            </span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {toast && <div className="profile-toast">{toast}</div>}
      {error && <p className="error profile-error">{error}</p>}

      {/* Form body */}
      {userType === 'member' ? (
        <MemberProfileForm state={member} onChange={setMember} saving={saving} onSave={handleSave} />
      ) : (
        <RecruiterProfileForm state={recruiter} onChange={setRecruiter} saving={saving} onSave={handleSave} />
      )}
    </section>
  )
}

// ── Member form ───────────────────────────────────────────────────────────────

function MemberProfileForm({
  state,
  onChange,
  saving,
  onSave,
}: {
  state: MemberState
  onChange: (next: MemberState) => void
  saving: boolean
  onSave: () => void
}) {
  const bind = <K extends keyof MemberState>(key: K) => ({
    value: state[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...state, [key]: e.target.value }),
  })

  return (
    <div className="profile-sections">
      <section className="profile-section">
        <h2 className="profile-section-title">Basic info</h2>
        <div className="form-grid">
          <label className="form-label">
            First name
            <input {...bind('first_name')} placeholder="Jane" />
          </label>
          <label className="form-label">
            Last name
            <input {...bind('last_name')} placeholder="Smith" />
          </label>
          <label className="form-label form-full">
            Headline
            <input {...bind('headline')} placeholder="ML Engineer at Acme" />
          </label>
          <label className="form-label form-full">
            About
            <textarea {...bind('about')} placeholder="Tell your professional story..." rows={4} />
          </label>
        </div>
      </section>

      <section className="profile-section">
        <h2 className="profile-section-title">Contact & location</h2>
        <div className="form-grid">
          <label className="form-label">
            Phone
            <input {...bind('phone')} placeholder="+1-555-0100" />
          </label>
          <label className="form-label">
            City
            <input {...bind('location_city')} placeholder="San Jose" />
          </label>
          <label className="form-label">
            State / Province
            <input {...bind('location_state')} placeholder="California" />
          </label>
          <label className="form-label">
            Country
            <input {...bind('location_country')} placeholder="USA" />
          </label>
        </div>
      </section>

      <section className="profile-section">
        <h2 className="profile-section-title">Skills & resume</h2>
        <div className="form-grid">
          <label className="form-label form-full">
            Skills <span className="profile-label-hint">(comma-separated)</span>
            <input {...bind('skills')} placeholder="Python, Kafka, React" />
          </label>
          <label className="form-label form-full">
            Resume text
            <textarea
              {...bind('resume_text')}
              placeholder="Paste your resume or a professional summary..."
              rows={6}
            />
          </label>
        </div>
      </section>

      <div className="profile-save-row">
        <button type="button" className="primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ── Recruiter form ────────────────────────────────────────────────────────────

function RecruiterProfileForm({
  state,
  onChange,
  saving,
  onSave,
}: {
  state: RecruiterState
  onChange: (next: RecruiterState) => void
  saving: boolean
  onSave: () => void
}) {
  const bind = <K extends keyof RecruiterState>(key: K) => ({
    value: state[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...state, [key]: e.target.value }),
  })

  return (
    <div className="profile-sections">
      <section className="profile-section">
        <h2 className="profile-section-title">Basic info</h2>
        <div className="form-grid">
          <label className="form-label">
            First name
            <input {...bind('first_name')} placeholder="Sarah" />
          </label>
          <label className="form-label">
            Last name
            <input {...bind('last_name')} placeholder="Johnson" />
          </label>
          <label className="form-label">
            Phone
            <input {...bind('phone')} placeholder="+1-555-0200" />
          </label>
          <label className="form-label">
            Role
            <input {...bind('role')} placeholder="Senior Recruiter" />
          </label>
        </div>
      </section>

      <section className="profile-section">
        <h2 className="profile-section-title">Company</h2>
        <div className="form-grid">
          <label className="form-label">
            Company name
            <input {...bind('company_name')} placeholder="Acme Corp" />
          </label>
          <label className="form-label">
            Industry
            <input {...bind('company_industry')} placeholder="Technology" />
          </label>
          <label className="form-label">
            Company size
            <input {...bind('company_size')} placeholder="1000-5000" />
          </label>
        </div>
      </section>

      <div className="profile-save-row">
        <button type="button" className="primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
