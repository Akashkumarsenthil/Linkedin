import { Icon } from './Icon'

export function NewsPage() {
  const trendingNews = [
    { id: 1, title: 'The future of Generative AI in software engineering', viewers: '45,201', time: '4h ago' },
    { id: 2, title: 'Remote work trends: Why hybrid is winning', viewers: '32,110', time: '6h ago' },
    { id: 3, title: 'Top 10 skills for Data Scientists in 2026', viewers: '28,500', time: '1d ago' },
    { id: 4, title: 'Silicon Valley outlook: New venture capital surges', viewers: '15,400', time: '2h ago' },
  ]

  const newsletters = [
    { id: 1, name: 'AI Frontiers', author: 'Dr. Michael S. Terrell', subscribers: '1.2M', img: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=100&h=100&fit=crop' },
    { id: 2, name: 'Product Pulse', author: 'Sarah Chen', subscribers: '850K', img: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=100&h=100&fit=crop' },
    { id: 3, name: 'The Engineering Manager', author: 'James Wilson', subscribers: '500K', img: 'https://images.unsplash.com/photo-1581092921461-eab62e97a780?w=100&h=100&fit=crop' },
  ]

  return (
    <div className="news-page page-fade">
      <header className="page-header">
        <div className="header-left">
          <h1>LinkedIn News</h1>
          <p>Stay updated with the latest professional trends and newsletters</p>
        </div>
      </header>

      <div className="news-layout">
        <div className="news-main">
          <section className="news-section li-card">
            <div className="section-hdr">
              <h3>Top Newsletters</h3>
              <button className="ghost-btn">Discover more</button>
            </div>
            <div className="newsletter-grid">
              {newsletters.map(n => (
                <div key={n.id} className="newsletter-card">
                  <img src={n.img} alt={n.name} className="nl-img" />
                  <div className="nl-info">
                    <h4>{n.name}</h4>
                    <p className="nl-author">By {n.author}</p>
                    <p className="nl-subs">{n.subscribers} subscribers</p>
                    <button className="secondary-btn btn-sm">Subscribe</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="news-section li-card" style={{ marginTop: '16px' }}>
            <div className="section-hdr">
              <h3>Professional Daily</h3>
              <span>Tuesday, April 28</span>
            </div>
            <div className="daily-list">
              {trendingNews.map(news => (
                <div key={news.id} className="daily-item">
                  <div className="daily-dot" />
                  <div className="daily-content">
                    <h4 className="daily-title">{news.title}</h4>
                    <p className="daily-meta">{news.time} • {news.viewers} readers</p>
                  </div>
                  <Icon name="arrow-right" size={16} />
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="news-sidebar">
          <div className="sidebar-card li-card">
            <h3>News Settings</h3>
            <p>Customize your news feed and newsletter preferences.</p>
            <button className="primary w-full">Edit Preferences</button>
          </div>
          
          <div className="sidebar-card li-card" style={{ marginTop: '16px' }}>
            <h3>Editors' Picks</h3>
            <ul className="picks-list">
              <li>How to negotiate your salary in 2026</li>
              <li>The rise of agentic AI in the workplace</li>
              <li>Mental health tips for tech professionals</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
