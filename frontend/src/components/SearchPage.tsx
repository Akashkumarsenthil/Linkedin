import { useEffect, useState } from 'react'
import { apiPost } from '../api'
import { Icon } from './Icon'

interface SearchPageProps {
  query: string
}

type SearchFilter = 'all' | 'people' | 'posts' | 'companies' | 'jobs' | 'groups' | 'events' | 'services' | 'courses' | 'products'

interface SearchResults {
  members: any[]
  jobs: any[]
  posts: any[]
  companies: any[]
  groups: any[]
  events: any[]
  services: any[]
  courses: any[]
  products: any[]
}

interface AdData {
  id: string
  title: string
  description: string
  imageUrl?: string
  cta: string
}

export function SearchPage({ query }: SearchPageProps) {
  const [results, setResults] = useState<SearchResults>({
    members: [], jobs: [], posts: [], companies: [], groups: [],
    events: [], services: [], courses: [], products: []
  })
  const [ad, setAd] = useState<AdData | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeFilter, setActiveFilter] = useState<SearchFilter>('all')

  useEffect(() => {
    if (!query) return

    const generateMock = (type: string, q: string) => {
      const arr = []
      for (let i = 1; i <= 5; i++) {
        arr.push({
          id: `${type}-${i}`,
          title: `${q} ${type.slice(0, -1)} ${i}`,
          subtitle: `Subtitle for ${type} ${i}`,
          description: `Description for ${type} result ${i} related to ${q}.`,
          author: `Author ${i}`,
          location: `Location ${i}`,
          meta: i * 10 + ' connected',
        })
      }
      return arr
    }

    const fetchResults = async () => {
      setLoading(true)
      try {
        const [mRes, jRes] = await Promise.all([
          apiPost<{ data: any[] }>('/members/search', { keyword: query, page_size: 10 }),
          apiPost<{ data: any[] }>('/jobs/search', { keyword: query, page_size: 10 })
        ])

        setResults({
          members: (mRes.data && mRes.data.length > 0) ? mRes.data : (
             query.includes(' ') ? [{
               member_id: 'mock-1',
               first_name: query.split(' ')[0],
               last_name: query.split(' ').slice(1).join(' '),
               headline: 'Professional on LinkedIn',
               location_city: 'San Francisco',
               location_state: 'CA'
             }] : []
          ),
          jobs: jRes.data || [],
          posts: generateMock('posts', query),
          companies: generateMock('companies', query),
          groups: generateMock('groups', query),
          events: generateMock('events', query),
          services: generateMock('services', query),
          courses: generateMock('courses', query),
          products: generateMock('products', query),
        })

        // Mock Ad fetch
        setAd({
          id: 'ad-1',
          title: 'Google Cloud for Startups',
          description: 'Get up to $200k in credits and technical support.',
          imageUrl: '/ad-image.png',
          cta: 'Learn More'
        })
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchResults()
  }, [query])

  const filters: { id: SearchFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'people', label: 'People' },
    { id: 'posts', label: 'Posts' },
    { id: 'companies', label: 'Companies' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'groups', label: 'Groups' },
    { id: 'events', label: 'Events' },
    { id: 'services', label: 'Services' },
    { id: 'courses', label: 'Courses' },
    { id: 'products', label: 'Products' },
  ]

  if (!query) return <div className="panel" style={{ padding: '40px', textAlign: 'center' }}>Enter a name, job title, or company to search...</div>

  return (
    <div className="search-results-page">
      {/* Top Filter Bar (Horizontal Pills) */}
      <div className="search-filter-container">
        <div className="search-filter-bar li-card">
          {filters.map(f => (
            <button
              key={f.id}
              className={`filter-btn ${activeFilter === f.id ? 'active' : ''}`}
              onClick={() => setActiveFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="search-layout-grid">
        {/* Left Sidebar: "On this page" */}
        <aside className="search-left-sidebar">
          <div className="panel quick-nav-panel">
            <h3 className="sidebar-title">On this page</h3>
            <ul className="quick-nav-list">
              <li className={activeFilter === 'people' ? 'active' : ''} onClick={() => setActiveFilter('people')}>People</li>
              <li className={activeFilter === 'jobs' ? 'active' : ''} onClick={() => setActiveFilter('jobs')}>Jobs</li>
              <li className={activeFilter === 'posts' ? 'active' : ''} onClick={() => setActiveFilter('posts')}>Posts</li>
              <li className={activeFilter === 'companies' ? 'active' : ''} onClick={() => setActiveFilter('companies')}>Companies</li>
            </ul>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="search-main-content">
          {loading ? (
            <div className="panel" style={{ padding: '24px' }}>
              <p>Searching for "{query}"...</p>
            </div>
          ) : (
            <div className="results-container">
              {/* Header */}
              <div className="results-header panel">
                <h2 className="results-title">
                  {activeFilter === 'all' ? 'Top results' : activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)} for <span className="query-highlight">"{query}"</span>
                </h2>
              </div>

              {/* Sections */}
              <div className="search-sections">
                {(activeFilter === 'all' || activeFilter === 'people') && (
                  <section className="search-section panel">
                    {activeFilter === 'all' && <h3 className="section-label">People</h3>}
                    {results.members.length === 0 ? (activeFilter === 'people' && <p className="no-results">No members found matching "{query}"</p>) : (
                      <ul className="search-list">
                        {results.members.map(m => (
                          <li key={m.member_id} className="search-card-item">
                            <div className="search-card-avatar">{(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}</div>
                            <div className="search-card-body">
                              <div className="card-name">{m.first_name} {m.last_name}</div>
                              <div className="card-headline">{m.headline}</div>
                              <div className="card-subtext">{m.location_city}, {m.location_state}</div>
                            </div>
                            <button className="card-action-btn-outline">Message</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {activeFilter === 'all' && results.members.length > 0 && (
                      <button className="see-all-link" onClick={() => setActiveFilter('people')}>See all people results</button>
                    )}
                  </section>
                )}

                {(activeFilter === 'all' || activeFilter === 'jobs') && (
                  <section className="search-section panel" style={{ marginTop: activeFilter === 'all' ? '12px' : '0' }}>
                    {activeFilter === 'all' && <h3 className="section-label">Jobs</h3>}
                    {results.jobs.length === 0 ? (activeFilter === 'jobs' && <p className="no-results">No jobs found matching "{query}"</p>) : (
                      <ul className="search-list">
                        {results.jobs.map(j => (
                          <li key={j.job_id} className="search-card-item">
                            <div className="search-card-icon"><Icon name="jobs" size={28} /></div>
                            <div className="search-card-body">
                              <div className="card-name">{j.title}</div>
                              <div className="card-headline">{j.company_name}</div>
                              <div className="card-subtext">{j.location} ({j.work_mode})</div>
                              <div className="card-meta">{j.applicants_count} applicants</div>
                            </div>
                            <button className="card-action-btn-outline">Apply</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {activeFilter === 'all' && results.jobs.length > 0 && (
                      <button className="see-all-link" onClick={() => setActiveFilter('jobs')}>See all job results</button>
                    )}
                  </section>
                )}

                {(activeFilter === 'all' || activeFilter === 'posts') && results.posts.length > 0 && (
                  <section className="search-section panel" style={{ marginTop: '12px' }}>
                    {activeFilter === 'all' && <h3 className="section-label">Posts</h3>}
                    <ul className="search-list">
                      {results.posts.map(p => (
                        <li key={p.id} className="search-card-item">
                          <div className="search-card-avatar" style={{ borderRadius: '4px' }}>P</div>
                          <div className="search-card-body">
                            <div className="card-name" style={{ color: 'var(--text-main)' }}>{p.author} posted this</div>
                            <div className="card-headline">{p.title}</div>
                            <div className="card-subtext">{p.description}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {(activeFilter === 'all' || activeFilter === 'companies') && results.companies.length > 0 && (
                  <section className="search-section panel" style={{ marginTop: '12px' }}>
                    {activeFilter === 'all' && <h3 className="section-label">Companies</h3>}
                    <ul className="search-list">
                      {results.companies.map(c => (
                        <li key={c.id} className="search-card-item">
                          <div className="search-card-icon"><Icon name="companies" size={28} /></div>
                          <div className="search-card-body">
                            <div className="card-name">{c.title}</div>
                            <div className="card-headline">Information Technology • {c.location}</div>
                            <div className="card-subtext">{c.meta} followers</div>
                          </div>
                          <button className="card-action-btn-outline">Follow</button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Other categories */}
                {['groups', 'events', 'services', 'courses', 'products'].map(cat => (
                  (activeFilter === 'all' || activeFilter === cat) && (results as any)[cat].length > 0 && (
                    <section key={cat} className="search-section panel" style={{ marginTop: '12px' }}>
                      {activeFilter === 'all' && <h3 className="section-label">{cat.charAt(0).toUpperCase() + cat.slice(1)}</h3>}
                      <ul className="search-list">
                        {(results as any)[cat].map((item: any) => (
                          <li key={item.id} className="search-card-item">
                            <div className="search-card-icon"><Icon name={cat === 'courses' ? 'learning' : cat} size={28} /></div>
                            <div className="search-card-body">
                              <div className="card-name">{item.title}</div>
                              <div className="card-headline">{item.subtitle}</div>
                              <div className="card-subtext">{item.description}</div>
                            </div>
                            <button className="card-action-btn-outline">View</button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )
                ))}

                {activeFilter !== 'all' && (results as any)[activeFilter]?.length === 0 && (
                  <div className="placeholder-results panel">
                    <Icon name="search" size={48} />
                    <p>No results found for {activeFilter}</p>
                    <span>Try adjusting your filters or search terms.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Right Sidebar */}
        <aside className="search-right-sidebar">
          <div className="panel ad-panel">
            <span className="ad-label">Ad · ...</span>
            {ad ? (
              <>
                <div className="ad-header" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                  {ad.imageUrl && (
                    <img src={ad.imageUrl} alt={ad.title} style={{ width: '100%', borderRadius: '4px', objectFit: 'cover' }} />
                  )}
                  <div style={{ textAlign: 'left', marginTop: '4px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{ad.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Promoted</div>
                  </div>
                </div>
                <p className="ad-text" style={{ fontSize: '12px', textAlign: 'left', margin: '8px 0' }}>{ad.description}</p>
                <button className="card-action-btn-outline" style={{ width: '100%' }}>{ad.cta}</button>
              </>
            ) : (
              <p className="ad-text">Loading ads...</p>
            )}
          </div>
          <div className="panel footer-links-mini">
            <span>About</span> <span>Help Center</span> <span>Privacy & Terms</span>
            <p>© 2026 S.I.M.P.S.O.N. Corporation</p>
          </div>
        </aside>
      </div>

      <style>{`
        .search-results-page {
          max-width: 1128px;
          margin: 0 auto;
          padding: 12px 0;
        }
        .search-filter-container {
          margin-bottom: 12px;
        }
        .search-filter-bar {
          display: flex;
          gap: 8px;
          padding: 8px 16px;
          overflow-x: auto;
          background: white;
          border: 1px solid var(--border-light);
          border-radius: 8px;
        }
        .filter-btn {
          padding: 6px 16px;
          border-radius: 16px;
          border: 1px solid var(--text-muted);
          background: white;
          color: var(--text-muted);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;
        }
        .filter-btn:hover {
          background: var(--bg-hover);
          color: var(--text-main);
        }
        .filter-btn.active {
          background: #01754f;
          border-color: #01754f;
          color: white;
        }
        .search-layout-grid {
          display: grid;
          grid-template-columns: 225px 1fr 300px;
          gap: 24px;
          align-items: start;
        }
        .search-left-sidebar, .search-right-sidebar {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sidebar-title {
          font-size: 14px;
          font-weight: 600;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-light);
        }
        .quick-nav-list {
          list-style: none;
          padding: 8px 0;
        }
        .quick-nav-list li {
          padding: 8px 16px;
          font-size: 14px;
          color: var(--text-muted);
          cursor: pointer;
          transition: background 0.2s;
        }
        .quick-nav-list li:hover {
          background: var(--bg-hover);
          color: var(--text-main);
          text-decoration: underline;
        }
        .quick-nav-list li.active {
          color: var(--ln-blue);
          font-weight: 600;
          border-left: 2px solid var(--ln-blue);
        }
        .results-header {
          padding: 16px 24px;
          margin-bottom: 12px;
        }
        .results-title {
          font-size: 16px;
          font-weight: 400;
          color: var(--text-main);
        }
        .query-highlight {
          font-weight: 600;
        }
        .section-label {
          font-size: 16px;
          font-weight: 600;
          padding: 16px 24px 8px;
        }
        .search-card-item {
          display: flex;
          gap: 12px;
          padding: 16px 24px;
          border-bottom: 1px solid var(--border-light);
          align-items: center;
        }
        .search-card-item:last-child {
          border-bottom: none;
        }
        .search-card-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #eef3f8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          color: var(--ln-blue);
          font-size: 20px;
          flex-shrink: 0;
        }
        .search-card-icon {
          width: 56px;
          height: 56px;
          background: #f3f2ef;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--text-muted);
        }
        .search-card-body {
          flex: 1;
        }
        .card-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--ln-blue);
        }
        .card-name:hover {
          text-decoration: underline;
          cursor: pointer;
        }
        .card-headline {
          font-size: 14px;
          color: var(--text-main);
          margin-top: 2px;
        }
        .card-subtext {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .card-meta {
          font-size: 12px;
          color: #057642; /* Green for applicants like LI */
          margin-top: 4px;
          font-weight: 600;
        }
        .card-action-btn-outline {
          padding: 6px 16px;
          border-radius: 20px;
          border: 1px solid var(--ln-blue);
          color: var(--ln-blue);
          background: transparent;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .card-action-btn-outline:hover {
          background: rgba(10, 102, 194, 0.1);
          border-width: 2px;
          padding: 5px 15px;
        }
        .see-all-link {
          width: 100%;
          padding: 12px;
          background: transparent;
          border: none;
          border-top: 1px solid var(--border-light);
          color: var(--text-muted);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          text-align: center;
        }
        .see-all-link:hover {
          background: var(--bg-hover);
          color: var(--text-main);
        }
        .ad-panel {
          padding: 16px;
          text-align: center;
        }
        .ad-label {
          font-size: 10px;
          color: var(--text-muted);
          float: right;
        }
        .ad-text {
          font-size: 14px;
          margin: 16px 0;
          color: var(--text-main);
        }
        .premium-btn {
          background: #e7a33e;
          color: black;
          border: none;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          cursor: pointer;
        }
        .footer-links-mini {
          padding: 16px;
          font-size: 12px;
          color: var(--text-muted);
          text-align: center;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
        }
        .footer-links-mini p {
          width: 100%;
          margin-top: 12px;
        }
        .placeholder-results {
          padding: 60px 24px;
          text-align: center;
          color: var(--text-muted);
        }
        .placeholder-results p {
          font-size: 18px;
          font-weight: 600;
          margin-top: 16px;
          color: var(--text-main);
        }
      `}</style>
    </div>
  )
}
