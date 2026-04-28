import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPost, parseStoredUser } from '../api'
import { Icon } from './Icon'
import { PostCard, type FeedPost } from './PostCard'

type UserType = 'member' | 'recruiter' | 'admin'

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
  me?: {
    user_id: number
    user_type: 'member' | 'recruiter' | 'admin'
    email: string
    profile: Record<string, unknown>
  } | null
  viewMemberId?: number | null
  onAuthChange?: () => void
  onNavigateProfile?: (id: number) => void
  onMessageProfile?: (id: number, type: 'member' | 'recruiter') => void
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

// ── Structured data types ─────────────────────────────────────────────────────

interface ExperienceEntry {
  title: string
  company: string
  years: number | string
  description: string
}

interface EducationEntry {
  degree: string
  field: string
  school: string
  year: number | string
  description: string
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
  cover_photo_url: string
  resume_pdf_url: string | null
  resume_filename: string | null
  experience: ExperienceEntry[]
  education: EducationEntry[]
  profile_views: number
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
  cover_photo_url: '',
  resume_pdf_url: null,
  resume_filename: null,
  experience: [],
  education: [],
  profile_views: 0,
}

function parseExperience(raw: unknown): ExperienceEntry[] {
  if (!raw) return []
  const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!Array.isArray(arr)) return []
  return arr.map((e: Record<string, unknown>) => ({
    title: String(e.title ?? ''),
    company: String(e.company ?? ''),
    years: e.years != null ? e.years : '',
    description: String(e.description ?? ''),
  })) as ExperienceEntry[]
}

function parseEducation(raw: unknown): EducationEntry[] {
  if (!raw) return []
  const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!Array.isArray(arr)) return []
  return arr.map((e: Record<string, unknown>) => ({
    degree: String(e.degree ?? ''),
    field: String(e.field ?? ''),
    school: String(e.school ?? ''),
    year: e.year != null ? e.year : '',
    description: String(e.description ?? ''),
  })) as EducationEntry[]
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
    cover_photo_url: String(p.cover_photo_url ?? ''),
    resume_pdf_url: p.resume_pdf_url ? String(p.resume_pdf_url) : null,
    resume_filename: p.resume_filename ? String(p.resume_filename) : null,
    experience: parseExperience(p.experience),
    education: parseEducation(p.education),
    profile_views: Number(p.profile_views ?? 0),
  }
}

// ── Recruiter form state ──────────────────────────────────────────────────────

interface RecruiterState {
  first_name: string
  last_name: string
  email: string
  phone: string
  company_name: string
  company_industry: string
  company_size: string
  role: string
  profile_photo_url: string
  cover_photo_url: string
}

const EMPTY_RECRUITER: RecruiterState = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  company_name: '',
  company_industry: '',
  company_size: '',
  role: '',
  profile_photo_url: '',
  cover_photo_url: '',
}

function recruiterFromProfile(p: Record<string, unknown>): RecruiterState {
  return {
    first_name: String(p.first_name ?? ''),
    last_name: String(p.last_name ?? ''),
    email: String(p.email ?? ''),
    phone: String(p.phone ?? ''),
    company_name: String(p.company_name ?? ''),
    company_industry: String(p.company_industry ?? ''),
    company_size: String(p.company_size ?? ''),
    role: String(p.role ?? ''),
    profile_photo_url: String(p.profile_photo_url ?? ''),
    cover_photo_url: String(p.cover_photo_url ?? ''),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProfilePage({ me, viewMemberId, onAuthChange, onNavigateProfile, onMessageProfile }: ProfilePageProps) {
  const storedUser = parseStoredUser()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [profileViews, setProfileViews] = useState<number | null>(null)
  const [showPhotoMenu, setShowPhotoMenu] = useState(false)
  const [connections, setConnections] = useState<number[]>([])
  const [pendingConnections, setPendingConnections] = useState<number[]>([])

  // New states for modals
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [showConnectionsModal, setShowConnectionsModal] = useState(false)
  const [activeConnections, setActiveConnections] = useState<number[]>([])
  const [connectionProfiles, setConnectionProfiles] = useState<any[]>([])
  const [loadingConnections, setLoadingConnections] = useState(false)

  const [userType, setUserType] = useState<UserType | null>(storedUser?.user_type ?? null)
  const [userId, setUserId] = useState<number | null>(storedUser?.user_id ?? null)
  const [email, setEmail] = useState<string>(storedUser?.email ?? '')

  const [member, setMember] = useState<MemberState>(EMPTY_MEMBER)
  const [recruiter, setRecruiter] = useState<RecruiterState>(EMPTY_RECRUITER)

  const [profileTab, setProfileTab] = useState<'overview' | 'posts'>('overview')
  const [profilePosts, setProfilePosts] = useState<FeedPost[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [postsError, setPostsError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const coverFileInputRef = useRef<HTMLInputElement | null>(null)
  const resumeFileInputRef = useRef<HTMLInputElement | null>(null)

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    const isOwnProfile = !viewMemberId || viewMemberId === storedUser?.user_id

    try {
      if (isOwnProfile) {
        setEditing(false)
        const me = await apiGet<MeResponse>('/auth/me')
        setUserType(me.user_type)
        setUserId(me.user_id)
        setEmail(me.email)
        if (me.user_type === 'member') {
          setMember(memberFromProfile(me.profile))
          try {
            const dashboardRes = await apiPost<any>('/analytics/member/dashboard', { member_id: me.user_id })
            if (dashboardRes.success) setProfileViews(dashboardRes.data.total_views_30d)
          } catch {}
          
          // Fetch connections for self
          try {
            const cRes = await apiPost<any>('/connections/list', { user_id: me.user_id, page: 1, page_size: 100 })
            if (cRes.success && cRes.data) {
              const connIds = cRes.data.map((c: any) => c.requester_id === me.user_id ? c.receiver_id : c.requester_id)
              setConnections(connIds)
              setActiveConnections(connIds)
            }
          } catch {}
        } else {
          setRecruiter(recruiterFromProfile(me.profile))
        }
      } else {
        setEditing(false)
        setUserId(viewMemberId)
        setEmail('')
        setProfileViews(null)
        
        // Try fetching as member first
        let res = await apiPost<{ success: boolean; data: Record<string, unknown>; message: string }>('/members/get', { member_id: viewMemberId })
        
        if (res.success) {
          setUserType('member')
          setMember(memberFromProfile(res.data))
        } else {
          // If not a member, try recruiter
          const rRes = await apiPost<{ success: boolean; data: Record<string, unknown>; message: string }>('/recruiters/get', { recruiter_id: viewMemberId })
          if (rRes.success) {
            setUserType('recruiter')
            setRecruiter(recruiterFromProfile(rRes.data))
          } else {
            throw new Error('Profile not found')
          }
        }

        // Fetch connections for other user to show count
        try {
          const cResOther = await apiPost<any>('/connections/list', { user_id: viewMemberId, page: 1, page_size: 100 })
          if (cResOther.success && cResOther.data) {
            const otherIds = cResOther.data.map((c: any) => c.requester_id === viewMemberId ? c.receiver_id : c.requester_id)
            setActiveConnections(otherIds)
          }
        } catch {}

        if (storedUser?.user_id) {
          apiPost<any>('/connections/list', { user_id: storedUser.user_id, page: 1, page_size: 100 })
            .then(cRes => {
              if (cRes.success && cRes.data) {
                const connIds = cRes.data.map((c: any) => 
                  c.requester_id === storedUser.user_id ? c.receiver_id : c.requester_id
                )
                setConnections(connIds)
              }
            }).catch(() => {})
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load profile')
    } finally {
      setLoading(false)
    }
  }, [viewMemberId, storedUser?.user_id])

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
    if (!file || userId == null) return

    setUploading(true)
    setError(null)
    try {
      const dataUrl = await fileToResizedDataUrl(file)
      
      // Optimistically update preview
      if (userType === 'member' || userType === 'admin') {
        setMember((m) => ({ ...m, profile_photo_url: dataUrl }))
      } else {
        setRecruiter((r) => ({ ...r, profile_photo_url: dataUrl }))
      }
      
      // Persist immediately
      const endpoint = (userType === 'member' || userType === 'admin') ? '/members/update' : '/recruiters/update'
      const idKey = (userType === 'member' || userType === 'admin') ? 'member_id' : 'recruiter_id'

      const res = await apiPost<SaveResponse>(endpoint, {
        [idKey]: userId,
        profile_photo_url: dataUrl,
      })
      if (!res.success) throw new Error(res.message || 'Upload failed')
      setToast('Photo updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handlePickCoverPhoto = () => coverFileInputRef.current?.click()

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' 
    if (!file || userId == null) return

    setUploading(true)
    setError(null)
    try {
      const dataUrl = await fileToResizedDataUrl(file)
      // Optimistically update preview
      if (userType === 'member' || userType === 'admin') {
        setMember((m) => ({ ...m, cover_photo_url: dataUrl }))
      } else {
        setRecruiter((r) => ({ ...r, cover_photo_url: dataUrl }))
      }
      
      // Persist immediately
      const endpoint = (userType === 'member' || userType === 'admin') ? '/members/update' : '/recruiters/update'
      const idKey = (userType === 'member' || userType === 'admin') ? 'member_id' : 'recruiter_id'

      const res = await apiPost<SaveResponse>(endpoint, {
        [idKey]: userId,
        cover_photo_url: dataUrl,
      })
      if (!res.success) throw new Error(res.message || 'Upload failed')
      setToast('Cover photo updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cover photo upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handlePickResume = () => resumeFileInputRef.current?.click()

  const handleResumeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || userId == null) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a PDF file')
      return
    }

    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const result = await apiPostMultipart<SaveResponse>('/members/resume/upload', formData)
      
      if (!result.success) throw new Error(result.message || 'Resume upload failed')
      
      setMember((m) => ({ 
        ...m, 
        resume_text: String(result.data?.resume_text || ''),
        resume_pdf_url: String(result.data?.resume_pdf_url || ''),
        resume_filename: String(result.data?.resume_filename || '')
      }))
      setToast('Resume uploaded and text extracted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resume upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteResume = async () => {
    if (userId == null) return
    setUploading(true)
    setError(null)
    try {
      const res = await apiPost<SaveResponse>('/members/update', {
        member_id: userId,
        resume_text: '',
        resume_pdf_url: null,
        resume_filename: null
      })
      if (!res.success) throw new Error(res.message || 'Failed to remove resume')
      
      setMember((m) => ({ 
        ...m, 
        resume_text: '',
        resume_pdf_url: null,
        resume_filename: null
      }))
      setToast('Resume removed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setUploading(false)
    }
  }

  const handleRemovePhoto = async () => {
    if (userId == null) return
    setUploading(true)
    setError(null)
    try {
      const endpoint = (userType === 'member' || userType === 'admin') ? '/members/update' : '/recruiters/update'
      const idKey = (userType === 'member' || userType === 'admin') ? 'member_id' : 'recruiter_id'

      const res = await apiPost<SaveResponse>(endpoint, {
        [idKey]: userId,
        profile_photo_url: '',
      })
      if (!res.success) throw new Error(res.message || 'Could not remove photo')
      
      if (userType === 'member' || userType === 'admin') {
        setMember((m) => ({ ...m, profile_photo_url: '' }))
      } else {
        setRecruiter((r) => ({ ...r, profile_photo_url: '' }))
      }
      
      setToast('Photo removed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveCoverPhoto = async () => {
    if (userId == null) return
    setUploading(true)
    setError(null)
    try {
      const endpoint = (userType === 'member' || userType === 'admin') ? '/members/update' : '/recruiters/update'
      const idKey = (userType === 'member' || userType === 'admin') ? 'member_id' : 'recruiter_id'

      const res = await apiPost<SaveResponse>(endpoint, {
        [idKey]: userId,
        cover_photo_url: '',
      })
      if (!res.success) throw new Error(res.message || 'Could not remove cover photo')
      
      if (userType === 'member' || userType === 'admin') {
        setMember((m) => ({ ...m, cover_photo_url: '' }))
      } else {
        setRecruiter((r) => ({ ...r, cover_photo_url: '' }))
      }
      
      setToast('Cover photo removed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setUploading(false)
    }
  }

  const handleShowConnections = async () => {
    setShowConnectionsModal(true)
    if (connectionProfiles.length > 0 && connectionProfiles.length === activeConnections.length) return
    
    setLoadingConnections(true)
    try {
      const profiles = await Promise.all(
        activeConnections.map(async (id) => {
          const res = await apiPost<any>('/members/get', { member_id: id })
          return res.success ? res.data : null
        })
      )
      setConnectionProfiles(profiles.filter(Boolean))
    } catch (err) {
      console.error('Failed to load connections:', err)
    } finally {
      setLoadingConnections(false)
    }
  }

  const loadPosts = useCallback(async () => {
    if (!viewMemberId && !userId) return
    setLoadingPosts(true)
    setPostsError(null)
    try {
      const res = await apiPost<{ data: FeedPost[] }>('/posts/feed', { 
        page: 1, 
        page_size: 20, 
        author_id: viewMemberId || userId,
        author_type: userType === 'admin' ? undefined : userType
      })
      setProfilePosts(res.data || [])
    } catch (err) {
      setPostsError(err instanceof Error ? err.message : 'Failed to load posts')
    } finally {
      setLoadingPosts(false)
    }
  }, [userId, viewMemberId, userType])

  useEffect(() => {
    if (profileTab === 'posts') {
      void loadPosts()
    }
  }, [profileTab, loadPosts])

  const handleSave = async () => {
    if (userId == null || userType == null) return
    setSaving(true)
    setError(null)
    try {
      if (userType === 'member' || userType === 'admin') {
        const skills = member.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const experience = member.experience.map((e) => ({
          title: e.title,
          company: e.company,
          years: typeof e.years === 'string' ? parseInt(e.years, 10) || 0 : e.years,
          description: e.description,
        }))
        const education = member.education.map((e) => ({
          degree: e.degree,
          field: e.field,
          school: e.school,
          year: typeof e.year === 'string' ? parseInt(e.year, 10) || 0 : e.year,
          description: e.description,
        }))
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
          experience,
          education,
          resume_text: member.resume_text,
          resume_pdf_url: member.resume_pdf_url,
          resume_filename: member.resume_filename,
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

  const handleSaveAndReturn = async () => {
    await handleSave()
    setEditing(false)
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
    userType === 'member' || userType === 'admin'
      ? `${member.first_name} ${member.last_name}`.trim() || email
      : `${recruiter.first_name} ${recruiter.last_name}`.trim() || email

  const initials =
    userType === 'member' || userType === 'admin'
      ? `${member.first_name[0] ?? ''}${member.last_name[0] ?? ''}`.toUpperCase() || email[0]?.toUpperCase()
      : `${recruiter.first_name[0] ?? ''}${recruiter.last_name[0] ?? ''}`.toUpperCase() || email[0]?.toUpperCase()

  const isOwnProfile = !viewMemberId || viewMemberId === storedUser?.user_id

  return (
    <section className="panel profile-panel">
      {/* Header card */}
      <div className="profile-hero-card">
        <div 
          className="profile-cover-photo" 
          style={{ 
            background: (userType === 'member' ? member.cover_photo_url : recruiter.cover_photo_url) 
              ? `url(${userType === 'member' ? member.cover_photo_url : recruiter.cover_photo_url}) center/cover no-repeat` 
              : '#0a66c2' 
          }}
        >
          {!(userType === 'member' ? member.cover_photo_url : recruiter.cover_photo_url) && (
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0 }}>
               <path d="M0,0 L100,0 L100,100 C75,50 25,100 0,0 Z" fill="#004182" opacity="0.3" />
            </svg>
          )}
          {isOwnProfile && (
            <div className="cover-photo-actions">
              <button className="cover-photo-edit-btn" title="Change cover photo" onClick={handlePickCoverPhoto} disabled={uploading}>
                <Icon name="camera" size={16} />
              </button>
              {(userType === 'member' ? member.cover_photo_url : recruiter.cover_photo_url) && (
                <button className="cover-photo-remove-btn" title="Remove cover photo" onClick={handleRemoveCoverPhoto} disabled={uploading}>
                  <Icon name="trash" size={16} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="profile-hero-top">
          {/* Hidden inputs */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
          <input
            type="file"
            ref={coverFileInputRef}
            onChange={handleCoverFileChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="profile-avatar-slot">
              {(userType === 'member' ? member.profile_photo_url : recruiter.profile_photo_url) ? (
                <img
                  src={userType === 'member' ? member.profile_photo_url : recruiter.profile_photo_url}
                  alt={displayName}
                  className="profile-avatar-img clickable-avatar"
                  onClick={() => setShowPhotoModal(true)}
                  title="View profile photo"
                />
              ) : (
                <div className="profile-avatar-fallback">{initials}</div>
              )}
              {isOwnProfile && (
                <>
                  <button
                    type="button"
                    className="profile-avatar-edit"
                    onClick={() => setShowPhotoMenu(v => !v)}
                    disabled={uploading}
                    title="Edit profile photo"
                  >
                    <Icon name="camera" size={16} />
                  </button>
                  {showPhotoMenu && (
                    <>
                      <div className="avatar-menu-overlay" onClick={() => setShowPhotoMenu(false)} style={{ zIndex: 100 }} />
                      <div className="photo-menu" style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8, zIndex: 101 }}>
                        <button type="button" className="photo-menu-item" onClick={() => { setShowPhotoMenu(false); handlePickPhoto() }}>
                          Update photo
                        </button>
                        {(userType === 'member' ? member.profile_photo_url : recruiter.profile_photo_url) && (
                          <button type="button" className="photo-menu-item photo-menu-remove" onClick={() => { setShowPhotoMenu(false); handleRemovePhoto() }}>
                            Remove photo
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="profile-hero-right">
              {isOwnProfile && userType === 'member' && (
                <div className="profile-view-stat">
                  <div className="profile-view-count">{profileViews ?? member.profile_views}</div>
                  <div className="profile-view-label">profile views</div>
                </div>
              )}
              {!editing && isOwnProfile && (
                <button type="button" className="profile-edit-btn" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={16} style={{ marginRight: 6 }} /> Edit profile
                </button>
              )}
              {editing && (
                <button type="button" className="ghost-btn" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              )}
            </div>
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
              {userType === 'member' && member.location_city && (
                <span className="profile-chip">{[member.location_city, member.location_state, member.location_country].filter(Boolean).join(', ')}</span>
              )}
              {userType === 'recruiter' && recruiter.email && (
                <span className="profile-chip profile-chip-email" title="Email is read-only">
                  {recruiter.email}
                </span>
              )}
            </div>

            {(userType === 'member' || userType === 'recruiter') && activeConnections.length > 0 && (
              <div className="profile-hero-connections" style={{ marginTop: 12 }}>
                <button 
                  type="button" 
                  className="link-btn connections-link" 
                  onClick={handleShowConnections}
                >
                  {activeConnections.length} connection{activeConnections.length !== 1 ? 's' : ''}
                </button>
              </div>
            )}

            {!editing && !isOwnProfile && storedUser && viewMemberId && (

              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                {connections.includes(viewMemberId) ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                      type="button" 
                      className="btn-message"
                      onClick={() => onMessageProfile?.(viewMemberId, userType as 'member' | 'recruiter')}
                    >
                      Message
                    </button>
                    <button 
                      type="button" 
                      className="ghost-btn" 
                      style={{ border: '1px solid #d11124', color: '#d11124' }}
                      onClick={async () => {
                        if (!window.confirm('Are you sure you want to remove this connection?')) return
                        try {
                          const res = await apiPost<any>('/connections/remove', { 
                            user_id: storedUser.user_id, 
                            other_id: viewMemberId 
                          })
                          if (res.success) {
                            setConnections(prev => prev.filter(id => id !== viewMemberId))
                            setToast('Connection removed')
                          } else {
                            alert(res.message)
                          }
                        } catch (e) {
                          alert('Failed to remove connection')
                        }
                      }}
                    >
                      Remove Connection
                    </button>
                  </div>
                ) : pendingConnections.includes(viewMemberId) ? (
                  <button type="button" className="btn-pending" style={{ cursor: 'default' }}>
                    Pending
                  </button>
                ) : (
                  <button 
                    type="button" 
                    className="btn-connect"
                    onClick={() => {
                      apiPost<any>('/connections/request', { 
                        requester_id: storedUser.user_id, 
                        receiver_id: viewMemberId 
                      }).then(res => {
                        if (res.success || res.message.includes('pending')) {
                          setPendingConnections(prev => [...prev, viewMemberId])
                        } else {
                          alert(res.message)
                        }
                      })
                    }}
                  >
                    Connect
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {editing && (userType === 'member' || userType === 'admin') && (
          <div className="profile-photo-actions">
            <button type="button" className="ghost-btn" onClick={handlePickPhoto} disabled={uploading}>
              {uploading ? 'Uploading…' : member.profile_photo_url ? 'Change photo' : 'Upload photo'}
            </button>
            {member.profile_photo_url && (
              <button type="button" className="ghost-btn" onClick={handleRemovePhoto} disabled={uploading}>
                Remove photo
              </button>
            )}
            <span className="profile-photo-hint">
              JPEG or PNG, up to 8 MB. Resized to 512px for fast loading.
            </span>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
      </div>

      {toast && <div className="profile-toast">{toast}</div>}
      {error && <p className="error profile-error">{error}</p>}

      {/* Tab Navigation */}
      {!editing && (
        <div className="profile-tabs" style={{ display: 'flex', gap: 16, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
          <button 
            type="button" 
            onClick={() => setProfileTab('overview')}
            style={{ padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: profileTab === 'overview' ? '2px solid var(--ln-blue, #0a66c2)' : '2px solid transparent', color: profileTab === 'overview' ? 'var(--ln-blue, #0a66c2)' : 'var(--text-sec)', fontWeight: profileTab === 'overview' ? 600 : 400, cursor: 'pointer' }}
          >
            Overview
          </button>
          <button 
            type="button" 
            onClick={() => setProfileTab('posts')}
            style={{ padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: profileTab === 'posts' ? '2px solid var(--ln-blue, #0a66c2)' : '2px solid transparent', color: profileTab === 'posts' ? 'var(--ln-blue, #0a66c2)' : 'var(--text-sec)', fontWeight: profileTab === 'posts' ? 600 : 400, cursor: 'pointer' }}
          >
            Posts
          </button>
        </div>
      )}

      {/* View mode — read-only display of existing data */}
      {!editing && profileTab === 'overview' && (userType === 'member' || userType === 'admin') && (
        <MemberProfileView state={member} />
      )}

      {/* Edit mode — form */}
      {editing && userType === 'member' && (
        <MemberProfileForm
          state={member}
          onChange={setMember}
          saving={saving}
          uploading={uploading}
          onSave={handleSaveAndReturn}
          resumeFileInputRef={resumeFileInputRef}
          onPickResume={handlePickResume}
          onResumeFileChange={handleResumeFileChange}
          onDeleteResume={handleDeleteResume}
        />
      )}
      {editing && userType === 'recruiter' && (
        <RecruiterProfileForm state={recruiter} onChange={setRecruiter} saving={saving} onSave={handleSaveAndReturn} />
      )}
      {!editing && profileTab === 'overview' && userType === 'recruiter' && (
        <div className="profile-sections">
          <section className="profile-section">
            <h2 className="profile-section-title">Company</h2>
            <div className="profile-view-grid">
              {recruiter.company_name && <div className="pv-item"><span className="pv-label">Company</span><span className="pv-value">{recruiter.company_name}</span></div>}
              {recruiter.company_industry && <div className="pv-item"><span className="pv-label">Industry</span><span className="pv-value">{recruiter.company_industry}</span></div>}
              {recruiter.role && <div className="pv-item"><span className="pv-label">Role</span><span className="pv-value">{recruiter.role}</span></div>}
              {recruiter.phone && <div className="pv-item"><span className="pv-label">Phone</span><span className="pv-value">{recruiter.phone}</span></div>}
            </div>
          </section>
        </div>
      )}

      {!editing && profileTab === 'posts' && (
        <div className="profile-posts-section">
          {postsError && <div className="feed-error-msg">{postsError}</div>}
          {loadingPosts && profilePosts.length === 0 ? (
            <div className="feed-empty">Loading posts…</div>
          ) : profilePosts.length === 0 ? (
            <div className="feed-empty">No posts yet.</div>
          ) : (
            <div className="feed-posts">
              {profilePosts.map((p) => (
                <PostCard 
                  key={p.post_id} 
                  post={p} 
                  currentUserId={storedUser?.user_id || 0} 
                  currentUserType={storedUser?.user_type || 'member'} 
                  currentUserPhoto={me?.profile?.profile_photo_url as string | undefined || null}
                  currentUserName={me?.user_type === 'recruiter' 
                    ? `${me?.profile?.first_name || ''} ${me?.profile?.last_name || ''}`.trim() || me?.email
                    : `${me?.profile?.first_name || ''} ${me?.profile?.last_name || ''}`.trim() || me?.email
                  }
                  onDeleted={(id) => setProfilePosts((prev) => prev.filter((x) => x.post_id !== id))} 
                  onNavigateProfile={onNavigateProfile || (() => {})} 
                />
              ))}
            </div>
          )}
        </div>
      )}
      {showPhotoModal && (
        <div className="modal-overlay" onClick={() => setShowPhotoModal(false)}>
          <div className="modal-content photo-viewer-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPhotoModal(false)}>✕</button>
            <div className="photo-viewer-container">
              <img 
                src={userType === 'member' ? member.profile_photo_url : recruiter.profile_photo_url} 
                alt={displayName} 
                className="full-photo" 
              />
            </div>
          </div>
        </div>
      )}

      {showConnectionsModal && (
        <div className="modal-overlay" onClick={() => setShowConnectionsModal(false)}>
          <div className="modal-content connections-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowConnectionsModal(false)}>✕</button>
            <h2 className="modal-title">Connections</h2>
            <div className="connections-list-body">
              {loadingConnections ? (
                <div className="loading-state">Loading connections...</div>
              ) : connectionProfiles.length === 0 ? (
                <div className="empty-state">No connections found.</div>
              ) : (
                connectionProfiles.map((p) => (
                  <div key={p.member_id} className="connection-item">
                    <div className="connection-avatar">
                      {p.profile_photo_url ? (
                        <img src={p.profile_photo_url} alt={p.first_name} />
                      ) : (
                        <div className="avatar-fallback">{p.first_name?.[0]}{p.last_name?.[0]}</div>
                      )}
                    </div>
                    <div className="connection-info">
                      <div className="connection-name">{p.first_name} {p.last_name}</div>
                      <div className="connection-headline">{p.headline}</div>
                    </div>
                    <button 
                      className="ghost-btn" 
                      onClick={() => {
                        setShowConnectionsModal(false);
                        if (onNavigateProfile) {
                          onNavigateProfile(p.member_id);
                        }
                      }}
                    >
                      View
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ── Member view (read-only) ───────────────────────────────────────────────────

function MemberProfileView({ state }: { state: MemberState }) {
  const skills = state.skills.split(',').map(s => s.trim()).filter(Boolean)
  const hasContact = state.phone || state.location_city || state.location_state || state.location_country
  const hasAbout = !!state.about

  return (
    <div className="profile-sections">
      {hasAbout && (
        <section className="profile-section">
          <h2 className="profile-section-title">About</h2>
          <p className="pv-about">{state.about}</p>
        </section>
      )}

      {state.experience.length > 0 && (
        <section className="profile-section">
          <h2 className="profile-section-title">Experience</h2>
          <div className="pv-list">
            {state.experience.map((e, i) => (
              <div key={i} className="pv-entry">
                <div className="pv-entry-title">{e.title}{e.company ? ` · ${e.company}` : ''}</div>
                {(e.years !== '' && e.years !== 0) && <div className="pv-entry-sub">{e.years} year{Number(e.years) !== 1 ? 's' : ''}</div>}
                {e.description && <div className="pv-entry-desc">{e.description}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {state.education.length > 0 && (
        <section className="profile-section">
          <h2 className="profile-section-title">Education</h2>
          <div className="pv-list">
            {state.education.map((e, i) => (
              <div key={i} className="pv-entry">
                <div className="pv-entry-title">{e.school}</div>
                <div className="pv-entry-sub">{[e.degree, e.field].filter(Boolean).join(', ')}{e.year ? ` · ${e.year}` : ''}</div>
                {e.description && <div className="pv-entry-desc">{e.description}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {skills.length > 0 && (
        <section className="profile-section">
          <h2 className="profile-section-title">Skills</h2>
          <div className="pv-skills">
            {skills.map((s, i) => <span key={i} className="pv-skill-tag">{s}</span>)}
          </div>
        </section>
      )}

      {hasContact && (
        <section className="profile-section">
          <h2 className="profile-section-title">Contact</h2>
          <div className="profile-view-grid">
            {state.phone && <div className="pv-item"><span className="pv-label">Phone</span><span className="pv-value">{state.phone}</span></div>}
            {state.location_city && <div className="pv-item"><span className="pv-label">City</span><span className="pv-value">{state.location_city}</span></div>}
            {state.location_state && <div className="pv-item"><span className="pv-label">State</span><span className="pv-value">{state.location_state}</span></div>}
            {state.location_country && <div className="pv-item"><span className="pv-label">Country</span><span className="pv-value">{state.location_country}</span></div>}
          </div>
        </section>
      )}

      {state.resume_text && (
        <section className="profile-section">
          <h2 className="profile-section-title">Resume</h2>
          <p className="pv-about">{state.resume_text}</p>
        </section>
      )}
    </div>
  )
}

// ── Member form ───────────────────────────────────────────────────────────────

function MemberProfileForm({
  state,
  onChange,
  saving,
  uploading,
  onSave,
  resumeFileInputRef,
  onPickResume,
  onResumeFileChange,
  onDeleteResume,
}: {
  state: MemberState
  onChange: (next: MemberState) => void
  saving: boolean
  uploading: boolean
  onSave: () => void
  resumeFileInputRef: React.RefObject<HTMLInputElement | null>
  onPickResume: () => void
  onResumeFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDeleteResume: () => void
}) {
  const bind = <K extends keyof MemberState>(key: K) => ({
    value: state[key] ?? '',
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

      {/* Experience editor */}
      <section className="profile-section">
        <h2 className="profile-section-title">Experience</h2>
        <ExperienceEditor
          entries={state.experience}
          onChange={(experience) => onChange({ ...state, experience })}
        />
      </section>

      {/* Education editor */}
      <section className="profile-section">
        <h2 className="profile-section-title">Education</h2>
        <EducationEditor
          entries={state.education}
          onChange={(education) => onChange({ ...state, education })}
        />
      </section>

      <section className="profile-section">
        <h2 className="profile-section-title">Skills & resume</h2>
        <div className="form-grid">
          <label className="form-label form-full">
            Skills <span className="profile-label-hint">(comma-separated)</span>
            <input {...bind('skills')} placeholder="Python, Kafka, React" />
          </label>
          
          <div className="form-label form-full" style={{ marginBottom: '20px' }}>
            Resume PDF
            <div className="resume-upload-row" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
              <input 
                type="file" 
                ref={resumeFileInputRef} 
                style={{ display: 'none' }} 
                accept=".pdf" 
                onChange={onResumeFileChange} 
              />
              
              {state.resume_pdf_url ? (
                <>
                  <div className="resume-status" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f3f6f8', borderRadius: '4px', border: '1px solid var(--border-light)', flex: 1 }}>
                    <Icon name="attachment" size={16} />
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {state.resume_filename || 'Resume uploaded'}
                    </span>
                  </div>
                  <button type="button" className="card-action-btn-outline" onClick={onPickResume} disabled={uploading}>
                    Replace
                  </button>
                  <button type="button" className="card-action-btn-outline" style={{ color: '#d32f2f' }} onClick={onDeleteResume} disabled={uploading}>
                    Delete
                  </button>
                </>
              ) : (
                <button type="button" className="card-action-btn-outline" style={{ width: '100%', padding: '12px', borderStyle: 'dashed' }} onClick={onPickResume} disabled={uploading}>
                  {uploading ? 'Processing...' : '+ Upload Resume PDF'}
                </button>
              )}
            </div>
          </div>

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
        <button type="button" className="primary" onClick={onSave} disabled={saving || uploading}>
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

// ── Experience editor ─────────────────────────────────────────────────────────

function ExperienceEditor({
  entries,
  onChange,
}: {
  entries: ExperienceEntry[]
  onChange: (entries: ExperienceEntry[]) => void
}) {
  const update = (idx: number, key: keyof ExperienceEntry, value: string) => {
    const next = [...entries]
    next[idx] = { ...next[idx], [key]: value }
    onChange(next)
  }
  const add = () =>
    onChange([...entries, { title: '', company: '', years: '', description: '' }])
  const remove = (idx: number) =>
    onChange(entries.filter((_, i) => i !== idx))

  return (
    <div className="structured-editor">
      {entries.map((entry, idx) => (
        <div key={idx} className="structured-card">
          <div className="form-grid">
            <label className="form-label">
              Title
              <input
                value={entry.title}
                onChange={(e) => update(idx, 'title', e.target.value)}
                placeholder="Software Engineer"
              />
            </label>
            <label className="form-label">
              Company
              <input
                value={entry.company}
                onChange={(e) => update(idx, 'company', e.target.value)}
                placeholder="Google"
              />
            </label>
            <label className="form-label">
              Years
              <input
                type="number"
                value={entry.years}
                onChange={(e) => update(idx, 'years', e.target.value)}
                placeholder="3"
                min={0}
                style={{ width: 80 }}
              />
            </label>
          </div>
          <label className="form-label form-full">
            Description <span className="profile-label-hint">(optional)</span>
            <textarea
              value={entry.description}
              onChange={(e) => update(idx, 'description', e.target.value)}
              placeholder="Describe your responsibilities and achievements..."
              rows={2}
            />
          </label>
          <button
            type="button"
            className="structured-remove"
            onClick={() => remove(idx)}
            title="Remove this entry"
          >
            ✕ Remove
          </button>
        </div>
      ))}
      <button type="button" className="ghost-btn structured-add" onClick={add}>
        + Add experience
      </button>
    </div>
  )
}

// ── Education editor ──────────────────────────────────────────────────────────

function EducationEditor({
  entries,
  onChange,
}: {
  entries: EducationEntry[]
  onChange: (entries: EducationEntry[]) => void
}) {
  const update = (idx: number, key: keyof EducationEntry, value: string) => {
    const next = [...entries]
    next[idx] = { ...next[idx], [key]: value }
    onChange(next)
  }
  const add = () =>
    onChange([...entries, { degree: '', field: '', school: '', year: '', description: '' }])
  const remove = (idx: number) =>
    onChange(entries.filter((_, i) => i !== idx))

  return (
    <div className="structured-editor">
      {entries.map((entry, idx) => (
        <div key={idx} className="structured-card">
          <div className="form-grid">
            <label className="form-label">
              Degree
              <input
                value={entry.degree}
                onChange={(e) => update(idx, 'degree', e.target.value)}
                placeholder="MS"
              />
            </label>
            <label className="form-label">
              Field
              <input
                value={entry.field}
                onChange={(e) => update(idx, 'field', e.target.value)}
                placeholder="Computer Science"
              />
            </label>
            <label className="form-label">
              School
              <input
                value={entry.school}
                onChange={(e) => update(idx, 'school', e.target.value)}
                placeholder="Stanford"
              />
            </label>
            <label className="form-label">
              Year
              <input
                type="number"
                value={entry.year}
                onChange={(e) => update(idx, 'year', e.target.value)}
                placeholder="2020"
                min={1950}
                max={2030}
                style={{ width: 90 }}
              />
            </label>
          </div>
          <label className="form-label form-full">
            Description <span className="profile-label-hint">(optional)</span>
            <textarea
              value={entry.description}
              onChange={(e) => update(idx, 'description', e.target.value)}
              placeholder="Activities, honors, coursework..."
              rows={2}
            />
          </label>
          <button
            type="button"
            className="structured-remove"
            onClick={() => remove(idx)}
            title="Remove this entry"
          >
            ✕ Remove
          </button>
        </div>
      ))}
      <button type="button" className="ghost-btn structured-add" onClick={add}>
        + Add education
      </button>
    </div>
  )
}
