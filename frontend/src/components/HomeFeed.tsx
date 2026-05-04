import { useCallback, useEffect, useRef, useState } from 'react'
import { apiPost } from '../api'
import { Icon } from './Icon'
import { PostComposer } from './PostComposer'
import { PostCard, type FeedPost } from './PostCard'
import { SinglePostPage } from './SinglePostPage'
import { TechMemoryGame } from './TechMemoryGame'

interface HomeFeedProps {
  me: {
    user_id: number
    user_type: 'member' | 'recruiter' | 'admin'
    email: string
    profile: Record<string, unknown>
  } | null
  onNavigateProfile: (id?: number) => void
  onNavigateTab?: (tab: string) => void
  onOpenSavedJobs?: () => void
  /** Opens full My jobs tab */
  onOpenMyJobs?: () => void
  /** Opens job search (e.g. empty “My jobs” CTA) */
  onOpenJobSearch?: () => void
  viewPostId?: number | null
  onBackPost?: () => void
  onSelectNews?: (id: number) => void
}

type HomeApplicationRow = {
  application_id: number
  job_id: number
  status: string
  application_datetime: string | null
}

type HomeMyJobPreview = {
  app: HomeApplicationRow
  title: string
  company: string
}

function memberStatusShort(status: string): string {
  const m: Record<string, string> = {
    submitted: 'Submitted',
    reviewing: 'In review',
    interview: 'Interview',
    offer: 'Shortlisted',
    rejected: 'Not selected',
  }
  return m[status] || status
}

const NEWS_ITEMS = [
  { id: 1, headline: 'The future of Generative AI in software engineering', age: '4h ago', readers: '45,201 readers', url: 'https://www.technologyreview.com/2024/01/04/1086037/generative-ai-software-engineering/' },
  { id: 2, headline: 'Remote work trends: Why hybrid is winning', age: '6h ago', readers: '32,110 readers', url: 'https://www.forbes.com/sites/bryanrobinson/2024/02/05/hybrid-work-is-here-to-stay-and-winning-over-remote-and-office-work/' },
  { id: 3, headline: 'Top 10 skills for Data Scientists in 2026', age: '1d ago', readers: '28,500 readers', url: 'https://www.datasciencecentral.com/top-10-skills-for-data-scientists-in-2024/' },
  { id: 4, headline: 'Silicon Valley outlook: VC surges', age: '2h ago', readers: '15,400 readers', url: 'https://news.crunchbase.com/venture/silicon-valley-funding-trends-2024/' },
]

const JOBS_MATCH = [
  { title: 'AI Research Engineer', company: 'Google', location: 'Mountain View, CA' },
  { title: 'Senior Fullstack Engineer', company: 'Stripe', location: 'San Francisco, CA' },
  { title: 'Staff ML Engineer', company: 'OpenAI', location: 'San Francisco, CA' },
]

const TODAY_PUZZLES = [
  { name: 'Tech Memory',     sub: 'Challenge your tech IQ', color: 'var(--ln-blue, #0a66c2)', isGame: true },
]

const QUOTES = [
  "Genius is 1% inspiration, 99% perspiration. — Edison",
  "The future belongs to those believe in dreams.",
  "Move fast and build things that matter.",
  "Stay hungry. Stay foolish. — Jobs",
  "The best way to predict the future is to invent it.",
  "Success is not final, failure is not fatal: it is the courage to continue that counts.",
  "Don't watch the clock; do what it does. Keep going.",
  "Opportunities don't happen, you create them.",
]

const SIMSON_SYSTEM = `You are S.I.M.P.S.O.N. 
Persona: JARVIS (MCU). Calm, professional, efficient.
Rule: Do NOT use filler words. Do NOT say 'Here is your update' or 'Certainly'. 
Directly answer the user's question based on the provided context. 
If the user asks for reminders, ONLY provide the reminders from the notes.
If asked for a briefing, provide a full update.
Keep responses extremely concise and to the point.`

function VoiceWave() {
  return (
    <div className="voice-wave">
      <div className="wave-bar" />
      <div className="wave-bar" />
      <div className="wave-bar" />
      <div className="wave-bar" />
    </div>
  )
}

function SimsonAgent({ userName }: { userName: string }) {
  const [status, setStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle')
  const [transcript, setTranscript] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('elevenlabs_key') || '')
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recognitionRef = useRef<any>(null)
  const clickCount = useRef(0)

  const speak = async (text: string) => {
    if (audioRef.current) audioRef.current.pause()
    window.speechSynthesis.cancel()

    if (apiKey) {
      try {
        setStatus('speaking')
        const VOICE_ID = '612b878b113047d9a770c069c8b4fdfe'
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true }
          })
        })
        if (!response.ok) throw new Error('ElevenLabs failed')
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.onended = () => setStatus('idle')
        audioRef.current = audio
        audio.play()
        return
      } catch (err) {
        console.error('ElevenLabs error', err)
      }
    }

    const u = new SpeechSynthesisUtterance(text)
    u.pitch = 0.85; u.rate = 1.0 
    const voices = window.speechSynthesis.getVoices()
    const maleVoice = voices.find(v => 
      v.name.includes('Daniel') || 
      v.name.includes('Microsoft David') || 
      v.name.includes('Google UK English Male') ||
      v.name.includes('Male') ||
      v.name.includes('Paul')
    )
    if (maleVoice) u.voice = maleVoice
    u.onstart = () => { setStatus('speaking'); setTranscript('') }
    u.onend   = () => setStatus('idle')
    window.speechSynthesis.speak(u)
  }

  const runAiResponse = async (voiceCommand?: string, mode: 'briefing' | 'question' = 'question') => {
    if (status === 'thinking' || status === 'speaking') return
    setStatus('thinking')
    const notes  = localStorage.getItem('ln-notes') || 'No current reminders.'
    const events = localStorage.getItem('ln-events') || 'No scheduled events.'
    const news   = NEWS_ITEMS.slice(0, 3).map(n => n.headline).join('. ')
    const jobs   = JOBS_MATCH.map(j => `${j.title} at ${j.company}`).join(', ')
    
    const context = `Context:
Reminders/Notes: ${notes}
Scheduled Events: ${events}
Newsletters: ${news}
New Job Openings: ${jobs}
User Name: ${userName}`

    let prompt = ''
    if (mode === 'briefing') {
      prompt = `Provide a full strategic briefing including newsletters, scheduled events, reminders, and specifically mention any new job openings. ${context}`
    } else {
      prompt = `Answer ONLY the following question based on the context. If the question is about reminders or events, list them clearly. If the question is about jobs, list the available openings. User Question: "${voiceCommand}"\n${context}`
    }

    const apiKey_OpenAI = import.meta.env.VITE_OPENAI_API_KEY

    try {
      if (!apiKey_OpenAI) {
        throw new Error('VITE_OPENAI_API_KEY is missing from .env')
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey_OpenAI}`
        },
        body: JSON.stringify({ 
          model: 'gpt-4o-mini', 
          messages: [
            { role: 'system', content: SIMSON_SYSTEM },
            { role: 'user', content: prompt }
          ],
          stream: true,
          temperature: 0.2
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error?.message || `OpenAI failure: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Neural stream corrupted')

      let fullText = ''
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += new TextDecoder().decode(value)
        
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep the last (potentially partial) line in buffer
        
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          
          const message = trimmed.replace(/^data: /, '')
          try {
            const json = JSON.parse(message)
            const token = json.choices[0]?.delta?.content
            if (token) {
              fullText += token
              setTranscript(fullText)
            }
          } catch (e) {
            // If it fails, maybe it's still partial despite line splitting? 
            // In standard SSE, this shouldn't happen if we split by \n.
          }
        }
      }
      speak(fullText)
    } catch (err: any) {
      console.error(err)
      setTranscript(`Neural link interrupted: ${err.message}`)
      speak("Neural link interrupted. Please check your OpenAI configuration.")
    } finally {
      setStatus('idle')
    }
  }

  const handleClick = () => {
    clickCount.current += 1
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (clickCount.current === 1) {
        if (status === 'speaking') {
           if (audioRef.current) audioRef.current.pause()
           window.speechSynthesis.cancel()
           setStatus('idle')
        } else {
           const firstName = userName.split(' ')[0]
           const hour = new Date().getHours()
           let timeOfDay = 'morning'
           if (hour >= 12 && hour < 17) timeOfDay = 'afternoon'
           else if (hour >= 17) timeOfDay = 'evening'
           speak(`Hi ${firstName}. Good ${timeOfDay}. Systems are nominal.`)
        }
      } else if (clickCount.current >= 2) {
        runAiResponse(undefined, 'briefing')
      }
      clickCount.current = 0
    }, 300)
  }

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitRecognition
    if (!SR) return
    if (recognitionRef.current) recognitionRef.current.stop()
    const r = new SR(); r.lang = 'en-US'; r.continuous = false; r.interimResults = true
    
    r.onstart = () => { setStatus('listening'); setTranscript('') }
    r.onend   = () => { if (status === 'listening') setStatus('idle') }
    r.onresult = (e: any) => {
      const result = e.results[0][0].transcript
      setTranscript(result)
      if (e.results[0].isFinal) {
        r.stop()
        runAiResponse(result, 'question')
      }
    }
    recognitionRef.current = r; r.start()
  }

  return (
    <div className={`simson-card simson-status-${status} ln-blue-sky`}>
      <button className="simson-settings-btn" onClick={() => setShowSettings(!showSettings)}>⚙️</button>
      {showSettings ? (
        <div className="simson-settings-panel">
          <p>ElevenLabs API Key:</p>
          <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); localStorage.setItem('elevenlabs_key', e.target.value); }} placeholder="Paste key here..." />
          <button type="button" onClick={() => setShowSettings(false)}>Close</button>
        </div>
      ) : (
        <>
          <div className="simson-avatar-wrap" onClick={handleClick}>
            <img src="/simson.png" alt="S.I.M.P.S.O.N." className="simson-img" />
            <div className="simson-status-glow" />
          </div>
          <div className="simson-info">
            <div className="simson-title">S.I.M.P.S.O.N.</div>
            <div className="simson-status-text">{status === 'idle' ? 'Online' : status.toUpperCase() + '...'}</div>
            {transcript && <div className="simson-transcript">"{transcript}"</div>}
          </div>
          <div className="simson-actions">
            <button type="button" className="simson-btn wave-toggle" onClick={startVoice} disabled={status !== 'idle'}><VoiceWave /></button>
          </div>
        </>
      )}
    </div>
  )
}

export function HomeFeed({
  me,
  onNavigateProfile,
  onNavigateTab,
  onOpenMyJobs,
  onOpenJobSearch,
  onSelectNews,
  viewPostId,
  onBackPost,
}: HomeFeedProps) {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showGame, setShowGame] = useState(false)
  const [dailyQuote, setDailyQuote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)])

  const [myJobsPreview, setMyJobsPreview] = useState<HomeMyJobPreview[]>([])
  const [myJobsLoading, setMyJobsLoading] = useState(false)
  const [myJobsError, setMyJobsError] = useState<string | null>(null)

  const [recruiterJobs, setRecruiterJobs] = useState<any[]>([])
  const [recruiterJobsLoading, setRecruiterJobsLoading] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setDailyQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
    }, 20000)
    return () => clearInterval(interval)
  }, [])

  const [view, setView] = useState<'all' | 'saved'>('all')
  const [savedPostIds, setSavedPostIds] = useState<number[]>(() => {
    const saved = localStorage.getItem('ln-saved-posts')
    return saved ? JSON.parse(saved) : []
  })

  useEffect(() => {
    localStorage.setItem('ln-saved-posts', JSON.stringify(savedPostIds))
  }, [savedPostIds])

  const [notes, setNotes] = useState(() => localStorage.getItem('ln-notes') || '')

  useEffect(() => {
    localStorage.setItem('ln-notes', notes)
  }, [notes])

  const loadFeed = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiPost<{ data: FeedPost[] }>('/posts/feed', { page: 1, page_size: 20 })
      setPosts(res.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadFeed() }, [loadFeed])

  const loadRecruiterJobs = useCallback(async () => {
    if (me?.user_type !== 'recruiter') return
    setRecruiterJobsLoading(true)
    try {
      const res = await apiPost<{ data: any[] }>('/jobs/recruiter', { recruiter_id: me.user_id, page: 1, page_size: 5 })
      setRecruiterJobs(res.data || [])
    } catch {
      // ignore
    } finally {
      setRecruiterJobsLoading(false)
    }
  }, [me])

  useEffect(() => { void loadRecruiterJobs() }, [loadRecruiterJobs])

  const memberId = me?.user_type === 'member' ? me.user_id : null

  const loadMyJobsPreview = useCallback(async () => {
    if (memberId == null) {
      setMyJobsPreview([])
      return
    }
    setMyJobsLoading(true)
    setMyJobsError(null)
    try {
      const appsRes = await apiPost<{ success?: boolean; message?: string; data?: HomeApplicationRow[] }>(
        '/applications/byMember',
        { member_id: memberId, page: 1, page_size: 25 },
      )
      if (appsRes.success === false) {
        throw new Error(appsRes.message || 'Could not load your applications.')
      }
      const apps = (appsRes.data || []).slice().sort((a, b) => {
        const ta = a.application_datetime ? new Date(a.application_datetime).getTime() : 0
        const tb = b.application_datetime ? new Date(b.application_datetime).getTime() : 0
        return tb - ta
      })
      const top = apps.slice(0, 5)
      const jobMap = new Map<number, { title: string; company: string }>()
      const chunk = 8
      for (let i = 0; i < top.length; i += chunk) {
        const slice = top.slice(i, i + chunk)
        await Promise.all(
          slice.map(async (a) => {
            try {
              const jr = await apiPost<{ success?: boolean; data?: Record<string, unknown> }>('/jobs/get', {
                job_id: a.job_id,
                member_id: memberId,
              })
              if (jr.success !== false && jr.data) {
                const d = jr.data
                jobMap.set(a.job_id, {
                  title: String(d.title ?? `Job #${a.job_id}`),
                  company: typeof d.company_name === 'string' ? d.company_name : `Company #${d.company_id ?? '?'}`,
                })
              }
            } catch {
              /* posting may be gone */
            }
          }),
        )
      }
      setMyJobsPreview(
        top.map((a) => ({
          app: a,
          title: jobMap.get(a.job_id)?.title ?? `Job #${a.job_id}`,
          company: jobMap.get(a.job_id)?.company ?? '—',
        })),
      )
    } catch (e) {
      setMyJobsError(e instanceof Error ? e.message : 'Failed to load applications')
      setMyJobsPreview([])
    } finally {
      setMyJobsLoading(false)
    }
  }, [memberId])

  useEffect(() => {
    void loadMyJobsPreview()
  }, [loadMyJobsPreview])

  if (!me) return null

  const profile   = me.profile as Record<string, unknown>
  const firstName = String(profile.first_name || '')
  const lastName  = String(profile.last_name  || '')
  const name      = `${firstName} ${lastName}`.trim() || me.email
  const headline  = String(profile.headline || profile.company_name || '') || ' '
  const photo     = (profile.profile_photo_url as string | undefined) || null
  const initials  = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || me.email.substring(0, 2).toUpperCase()

  return (
    <div className="home-feed-layout">
      <aside className="feed-left-rail">
        <div className="feed-profile-card">
          <div className="feed-profile-cover ln-blue-sky-gradient" />
          <button type="button" className="feed-profile-avatar-btn" onClick={() => onNavigateProfile(me.user_id)}>
            {photo ? <img src={photo} alt={name} className="feed-profile-avatar-img" /> : <div className="feed-profile-avatar-fallback">{initials}</div>}
          </button>
          <div className="feed-profile-info">
            <button type="button" className="feed-profile-name-btn" onClick={() => onNavigateProfile(me.user_id)}>{name}</button>
            {headline.trim() && <p className="feed-profile-headline">{headline}</p>}
          </div>
          {me.user_type === 'member' && (
            <div className="feed-profile-stats">
              <button type="button" className="feed-stat-row" onClick={() => {
                const url = new URL(window.location.href)
                url.searchParams.set('section', 'profile-views')
                window.history.pushState({}, '', url)
                if (onNavigateTab) onNavigateTab('notifications')
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="eye" size={16} style={{ color: 'var(--text-muted)' }} />
                  <span className="feed-stat-label">Profile viewers</span>
                </div>
                <span className="feed-stat-value">{Number(profile.profile_views || 0).toLocaleString()}</span>
              </button>
              <button type="button" className="feed-stat-row" onClick={() => onNavigateTab?.('members')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="connections" size={16} style={{ color: 'var(--text-muted)' }} />
                  <span className="feed-stat-label">Connections</span>
                </div>
                <span className="feed-stat-value">{Number(profile.connections_count || 0).toLocaleString()}</span>
              </button>
            </div>
          )}
        </div>

        <nav className="feed-left-links">
          <button 
            className="feed-left-link-btn" 
            onClick={() => onNavigateTab('saved')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-sec)' }}
          >
            <Icon name="bookmark" size={16} /> 
            <span>Saved items {savedPostIds.length > 0 && `(${savedPostIds.length})`}</span>
          </button>
          <button 
            className="feed-left-link-btn" 
            onClick={() => onNavigateTab('news')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-sec)' }}
          >
            <Icon name="article" size={16} /> 
            <span>Newsletters</span>
          </button>
          <button 
            className="feed-left-link-btn" 
            onClick={() => onNavigateTab('events')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-sec)' }}
          >
            <Icon name="analytics" size={16} /> 
            <span>Events</span>
          </button>
        </nav>

        <div className="feed-quote-card li-card" style={{ marginTop: 12, borderTop: '4px solid var(--ln-blue, #0a66c2)' }}>
          <div className="section-heading" style={{ padding: '8px 16px', fontSize: 12, color: 'var(--ln-blue, #0a66c2)' }}>Mindscape</div>
          <div style={{ padding: '0 16px 16px' }}>
            <p style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-sec)', lineHeight: 1.5, margin: 0 }}>"{dailyQuote}"</p>
          </div>
        </div>

        <div className="feed-notes-card li-card" style={{ marginTop: 12 }}>
          <div className="section-heading" style={{ padding: '12px 16px', borderBottom: '1px solid var(--li-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>My Activity</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>Auto-saves</span>
          </div>
          <div style={{ padding: '12px' }}>
            <textarea 
              className="feed-activity-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jot down professional notes, reminders, or insights... Simson will read these during your briefing."
              style={{
                width: '100%',
                minHeight: '120px',
                border: 'none',
                resize: 'none',
                fontSize: '13px',
                color: 'var(--text-main)',
                background: 'transparent',
                outline: 'none',
                lineHeight: '1.6',
                fontFamily: 'inherit'
              }}
            />
          </div>
        </div>
      </aside>

      <section className="feed-center">
        {viewPostId ? (
          <SinglePostPage 
            postId={viewPostId} 
            onNavigateProfile={onNavigateProfile} 
            onBack={onBackPost || (() => {})} 
          />
        ) : (
          <>
            <div className="premium-panel" style={{ marginBottom: 12 }}>
              <PostComposer authorName={name} authorHeadline={headline} authorPhoto={photo} onPosted={loadFeed} />
            </div>
            {error && <div className="feed-error-msg">{error}</div>}
            {loading && posts.length === 0 ? <div className="feed-empty">Loading posts…</div> : (
              <div className="feed-posts">
                {posts
                  .filter(p => view === 'all' || savedPostIds.includes(p.post_id))
                  .map((p) => (
                    <PostCard 
                      key={p.post_id} 
                      post={p} 
                      currentUserId={me.user_id} 
                      currentUserType={me.user_type} 
                      currentUserPhoto={photo} 
                      currentUserName={name} 
                      isSaved={savedPostIds.includes(p.post_id)}
                      onToggleSave={(id) => setSavedPostIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                      onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.post_id !== id))} 
                      onNavigateProfile={onNavigateProfile} 
                    />
                  ))}
              </div>
            )}
          </>
        )}
      </section>

      <aside className="feed-right-rail">
        <SimsonAgent userName={name} userId={me.user_id} />

        {me.user_type === 'member' && (
          <div className="feed-my-jobs-card premium-panel" style={{ borderTop: '4px solid #0a66c2' }}>
            <header className="premium-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
              <span className="premium-title" style={{ fontSize: 13 }}>My jobs</span>
              {myJobsPreview.length > 0 && (
                <button type="button" className="feed-my-jobs-see-all" onClick={() => onOpenMyJobs?.()} style={{ fontSize: 12, fontWeight: 600, color: 'var(--li-link)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  See all
                </button>
              )}
            </header>
            <div style={{ padding: '0 16px 12px' }}>
              <p className="feed-my-jobs-sub" style={{ fontSize: 11, color: 'var(--text-sec)', marginBottom: 8 }}>Roles you applied to</p>
            {myJobsLoading && myJobsPreview.length === 0 ? (
              <p className="feed-my-jobs-empty">Loading your applications…</p>
            ) : myJobsError ? (
              <p className="feed-my-jobs-empty">{myJobsError}</p>
            ) : myJobsPreview.length === 0 ? (
              <div className="feed-my-jobs-empty-block">
                <p>No applications yet. Apply from Job Search and they will show up here.</p>
                <button type="button" className="feed-my-jobs-cta" onClick={() => onOpenJobSearch?.()}>
                  Browse jobs
                </button>
              </div>
            ) : (
              <ul className="feed-my-jobs-list">
                {myJobsPreview.map(({ app, title, company }) => (
                  <li key={app.application_id}>
                    <button
                      type="button"
                      className="feed-my-jobs-row"
                      onClick={() => onOpenMyJobs?.()}
                    >
                      <span className="feed-my-jobs-row-title">{title}</span>
                      <span className="feed-my-jobs-row-meta">{company}</span>
                      <span className={`feed-my-jobs-status feed-my-jobs-status--${app.status === 'rejected' ? 'bad' : app.status === 'offer' ? 'good' : 'neutral'}`}>
                        {memberStatusShort(app.status)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            </div>
          </div>
        )}
        
        <div className="feed-news-card premium-panel" style={{ borderTop: '4px solid #0a66c2' }}>
          <header className="premium-header" style={{ padding: '12px 16px' }}>
            <span className="premium-title" style={{ fontSize: 13 }}>LinkedIn News</span>
          </header>
          <div style={{ padding: '0 16px 12px' }}>
            <p className="feed-news-sub" style={{ fontSize: 11, color: 'var(--text-sec)', margin: '8px 0' }}>Top stories</p>
          <ul className="feed-news-list">
            {NEWS_ITEMS.slice(0, 5).map((item, idx) => (
              <li key={idx} className="feed-news-item" onClick={() => {
                onSelectNews?.(item.id)
                if (item.url) window.open(item.url, '_blank')
              }} style={{ cursor: 'pointer' }}>
                <span className="feed-news-bullet" />
                <div>
                  <p className="feed-news-headline" style={{ fontWeight: 600 }}>{item.headline}</p>
                  <p className="feed-news-meta">{item.age} · {item.readers}</p>
                </div>
              </li>
            ))}
          </ul>
          </div>
          
          <div className="feed-puzzles-section" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <p className="feed-news-sub" style={{ marginBottom: 12 }}>Today's puzzles</p>
            <ul className="feed-puzzles-list" style={{ listStyle: 'none', padding: 0 }}>
              {TODAY_PUZZLES.map((p, idx) => (
                <li key={idx} className="feed-puzzle-item" 
                    onClick={() => { if ((p as any).isGame) setShowGame(true); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, cursor: 'pointer' }}>
                  <span className="feed-puzzle-swatch" style={{ width: 12, height: 12, borderRadius: 2, background: p.color }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-sec)' }}>{p.sub}</p>
                  </div>
                  <span style={{ color: 'var(--text-muted)' }}>›</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {me.user_type === 'recruiter' ? (
          <div className="feed-jobs-match-card premium-panel" style={{ marginTop: 12, borderTop: '4px solid #0a66c2' }}>
            <div className="premium-header" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="premium-title" style={{ fontSize: 13 }}>Your job postings</span>
              <button className="stat-link" style={{ fontWeight: 600, color: 'var(--li-link)' }} onClick={() => onNavigateTab?.('jobs')}>Manage</button>
            </div>
            <div style={{ padding: '8px 0' }}>
              {recruiterJobsLoading ? (
                <p style={{ padding: '16px', fontSize: 12, color: '#666' }}>Loading your postings...</p>
              ) : recruiterJobs.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>No active postings found.</p>
                  <button className="secondary-btn btn-sm" onClick={() => onNavigateTab?.('jobs')}>Post a job</button>
                </div>
              ) : (
                <ul className="feed-news-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {recruiterJobs.map((job) => (
                    <li key={job.job_id} className="feed-news-item" onClick={() => onNavigateTab?.('jobs')} style={{ cursor: 'pointer', padding: '10px 16px' }}>
                      <span className="feed-news-bullet" />
                      <div>
                        <p className="feed-news-headline" style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-main)' }}>{job.title}</p>
                        <p className="feed-news-meta" style={{ fontSize: 11 }}>{job.location} · {job.applicants_count || 0} applicants</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="feed-jobs-match-card premium-panel" style={{ marginTop: 12, borderTop: '4px solid #0a66c2' }}>
            <div className="premium-header" style={{ padding: '12px 16px' }}>
              <span className="premium-title" style={{ fontSize: 13 }}>Jobs that match</span>
            </div>
            <div style={{ padding: '0 16px 12px' }}>
              {JOBS_MATCH.map((job, idx) => (
                <div key={idx} className="job-match-item" style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => onNavigateTab?.('jobs')}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0a66c2' }}>{job.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>{job.company} · {job.location}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {showGame && (
        <div className="modal-overlay" onClick={() => setShowGame(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowGame(false)}>×</button>
            <TechMemoryGame />
          </div>
        </div>
      )}
    </div>
  )
}
