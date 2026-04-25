import { useCallback, useEffect, useRef, useState } from 'react'
import { apiPost } from '../api'
import { Icon } from './Icon'
import { PostComposer } from './PostComposer'
import { PostCard, type FeedPost } from './PostCard'
import { TechMemoryGame } from './TechMemoryGame'

interface HomeFeedProps {
  me: {
    user_id: number
    user_type: 'member' | 'recruiter'
    email: string
    profile: Record<string, unknown>
  } | null
  onNavigateProfile: () => void
}

const NEWS_ITEMS = [
  { headline: 'Mendoza goes first in NFL draft',              age: '57m ago', readers: '65,438 readers' },
  { headline: 'OpenAI launches GPT-5.5 as next step',        age: '1h ago',  readers: '17,694 readers' },
  { headline: 'Meta is laying off 8K staffers',              age: '1h ago',  readers: '11,954 readers' },
  { headline: 'US reclassifies some marijuana',              age: '1h ago',  readers: '6,212 readers' },
  { headline: 'Intel shares spike amid signs of turnaround', age: '1h ago',  readers: '4,038 readers' },
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
    const notes = localStorage.getItem('ln-notes') || 'No current reminders.'
    const news  = NEWS_ITEMS.slice(0, 3).map(n => n.headline).join('. ')
    const jobs  = JOBS_MATCH.map(j => `${j.title} at ${j.company}`).join(', ')
    
    const context = `Context:
Reminders/Notes: ${notes}
News: ${news}
New Job Openings: ${jobs}
User Name: ${userName}`

    let prompt = ''
    if (mode === 'briefing') {
      prompt = `Provide a full strategic briefing including news, reminders, and specifically mention any new job openings that might interest the user. ${context}`
    } else {
      prompt = `Answer ONLY the following question based on the context. If the question is about reminders, only list the reminders. If the question is about jobs, list the available openings. User Question: "${voiceCommand}"\n${context}`
    }

    try {
      const res = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: 'llama3.2', 
          prompt: `${SIMSON_SYSTEM}\n\n${prompt}\nS.I.M.P.S.O.N.:`, 
          stream: false,
          options: { temperature: 0.2 } 
        }),
      })
      const data = await res.json()
      speak(data.response || "Systems operational.")
    } catch { speak("Neural link interrupted.") }
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

export function HomeFeed({ me, onNavigateProfile }: HomeFeedProps) {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showGame, setShowGame] = useState(false)
  const [dailyQuote, setDailyQuote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)])

  useEffect(() => {
    const interval = setInterval(() => {
      setDailyQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)])
    }, 20000)
    return () => clearInterval(interval)
  }, [])

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
          <button type="button" className="feed-profile-avatar-btn" onClick={onNavigateProfile}>
            {photo ? <img src={photo} alt={name} className="feed-profile-avatar-img" /> : <div className="feed-profile-avatar-fallback">{initials}</div>}
          </button>
          <div className="feed-profile-info">
            <button type="button" className="feed-profile-name-btn" onClick={onNavigateProfile}>{name}</button>
            {headline.trim() && <p className="feed-profile-headline">{headline}</p>}
          </div>
          <div className="feed-profile-stats">
            <button type="button" className="feed-stat-row" onClick={onNavigateProfile}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="eye" size={16} style={{ color: 'var(--text-muted)' }} />
                <span className="feed-stat-label">Profile viewers</span>
              </div>
              <span className="feed-stat-value">{Number(profile.profile_views || 0).toLocaleString()}</span>
            </button>
            <button type="button" className="feed-stat-row" onClick={onNavigateProfile}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="connections" size={16} style={{ color: 'var(--text-muted)' }} />
                <span className="feed-stat-label">Connections</span>
              </div>
              <span className="feed-stat-value">{Number(profile.connections_count || 0).toLocaleString()}</span>
            </button>
          </div>
        </div>

        <nav className="feed-left-links">
          <a className="feed-left-link" href="#saved"><Icon name="check" size={16} /> Saved items</a>
          <a className="feed-left-link" href="#groups"><Icon name="connections" size={16} /> Groups</a>
          <a className="feed-left-link" href="#newsletters"><Icon name="article" size={16} /> Newsletters</a>
          <a className="feed-left-link" href="#events"><Icon name="analytics" size={16} /> Events</a>
        </nav>

        <div className="feed-quote-card li-card" style={{ marginTop: 12, borderTop: '4px solid var(--ln-blue, #0a66c2)' }}>
          <div className="section-heading" style={{ padding: '8px 16px', fontSize: 12, color: 'var(--ln-blue, #0a66c2)' }}>Mindscape</div>
          <div style={{ padding: '0 16px 16px' }}>
            <p style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-sec)', lineHeight: 1.5, margin: 0 }}>"{dailyQuote}"</p>
          </div>
        </div>

        <div className="feed-notes-card li-card" style={{ marginTop: 12 }}>
          <div className="section-heading" style={{ padding: '12px 16px' }}>Reminders</div>
          <div style={{ padding: '0 16px 16px' }}>
            <textarea 
              className="notes-area" 
              placeholder="Enter your reminders" 
              defaultValue={localStorage.getItem('ln-notes') || ''} 
              onChange={e => localStorage.setItem('ln-notes', e.target.value)} 
              rows={4} 
            />
          </div>
        </div>
      </aside>

      <section className="feed-center">
        <PostComposer authorName={name} authorHeadline={headline} authorPhoto={photo} onPosted={loadFeed} />
        {error && <div className="feed-error-msg">{error}</div>}
        {loading && posts.length === 0 ? <div className="feed-empty">Loading posts…</div> : (
          <div className="feed-posts">
            {posts.map((p) => (
              <PostCard key={p.post_id} post={p} currentUserId={me.user_id} currentUserType={me.user_type} onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.post_id !== id))} />
            ))}
          </div>
        )}
      </section>

      <aside className="feed-right-rail">
        <SimsonAgent userName={name} />
        
        <div className="feed-news-card li-card">
          <div className="feed-news-header">
            <h3 className="feed-news-title">LinkedIn News</h3>
          </div>
          <p className="feed-news-sub">Top stories</p>
          <ul className="feed-news-list">
            {NEWS_ITEMS.slice(0, 5).map((item, idx) => (
              <li key={idx} className="feed-news-item">
                <span className="feed-news-bullet" />
                <div>
                  <p className="feed-news-headline">{item.headline}</p>
                  <p className="feed-news-meta">{item.age} · {item.readers}</p>
                </div>
              </li>
            ))}
          </ul>
          
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

        <div className="feed-jobs-card li-card">
          <div className="section-heading" style={{ padding: '12px 16px' }}>Jobs that match</div>
          <ul className="feed-news-list" style={{ padding: '0 16px 16px' }}>
            {JOBS_MATCH.map((job, i) => (
              <li key={i} className="feed-news-item" style={{ marginBottom: 12 }}>
                <div>
                   <p className="feed-news-headline" style={{ color: 'var(--ln-blue, #0a66c2)', cursor: 'pointer' }}>{job.title}</p>
                   <p className="feed-news-meta">{job.company} · {job.location}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="feed-promo-card li-card">
          <span className="feed-promo-tag">Promoted</span>
          <p className="feed-promo-headline">{name.split(' ')[0]}, explore relevant opportunities</p>
          <p className="feed-promo-sub">Get the latest jobs and industry news tailored for you.</p>
          <button type="button" className="secondary-btn feed-promo-btn">Follow</button>
        </div>
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
