import React, { useState } from 'react'
import { Icon } from './Icon'

interface Article {
  id: number;
  title: string;
  viewers: string;
  time: string;
  content: string;
}

export function NewsPage() {
  const [subscribed, setSubscribed] = useState<number[]>([])
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)

  const trendingNews: Article[] = [
    { id: 1, title: 'The future of Generative AI in software engineering', viewers: '45,201', time: '4h ago', content: 'As we look toward 2026, the landscape of software engineering is being fundamentally reshaped by Agentic AI. Developers are moving from writing code to orchestrating complex AI agents that handle entire modules of functionality...' },
    { id: 2, title: 'Remote work trends: Why hybrid is winning', viewers: '32,110', time: '6h ago', content: 'The debate between full remote and return-to-office has reached a consensus: Hybrid models provide the flexibility employees crave with the face-to-face collaboration that drives innovation.' },
    { id: 3, title: 'Top 10 skills for Data Scientists in 2026', viewers: '28,500', time: '1d ago', content: 'Data science is no longer just about cleaning data. The new top skills include LLM orchestration, vector database management, and prompt engineering for enterprise-scale AI systems.' },
    { id: 4, title: 'Silicon Valley outlook: New venture capital surges', viewers: '15,400', time: '2h ago', content: 'A massive wave of new VC funding is hitting the valley, specifically targeting agentic infrastructure startups. Investors are looking for the next layer of the AI stack.' },
  ]

  const newsletters = [
    { id: 1, name: 'AI Frontiers', author: 'Dr. Michael S. Terrell', subscribers: '1.2M', img: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=100&h=100&fit=crop' },
    { id: 2, name: 'Product Pulse', author: 'Sarah Chen', subscribers: '850K', img: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=100&h=100&fit=crop' },
    { id: 3, name: 'The Engineering Manager', author: 'James Wilson', subscribers: '500K', img: 'https://images.unsplash.com/photo-1581092921461-eab62e97a780?w=100&h=100&fit=crop' },
  ]

  const toggleSub = (id: number) => {
    setSubscribed((prev: number[]) => prev.includes(id) ? prev.filter((x: number) => x !== id) : [...prev, id])
  }

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
              <button className="stat-link" onClick={() => alert('Discovering more newsletters...')}>Discover more</button>
            </div>
            <div className="newsletter-grid">
              {newsletters.map(n => (
                <div key={n.id} className="newsletter-card">
                  <img src={n.img} alt={n.name} className="nl-img" />
                  <div className="nl-info">
                    <h4>{n.name}</h4>
                    <p className="nl-author">By {n.author}</p>
                    <p className="nl-subs">{n.subscribers} subscribers</p>
                    <button 
                      className={subscribed.includes(n.id) ? "primary btn-sm" : "secondary-btn btn-sm"}
                      onClick={() => toggleSub(n.id)}
                    >
                      {subscribed.includes(n.id) ? '✓ Subscribed' : 'Subscribe'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="news-section li-card" style={{ marginTop: '16px' }}>
            <div className="section-hdr">
              <h3>Professional Daily</h3>
              <span style={{ fontSize: '12px', color: 'var(--li-text-sec)' }}>Tuesday, April 28</span>
            </div>
            <div className="daily-list">
              {trendingNews.map(news => (
                <div key={news.id} className="daily-item" onClick={() => setSelectedArticle(news)}>
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
            <button className="primary w-full" onClick={() => alert('Opening Preferences Modal...')}>Edit Preferences</button>
          </div>
          
          <div className="sidebar-card li-card" style={{ marginTop: '16px' }}>
            <h3>Editors' Picks</h3>
            <ul className="picks-list">
              <li onClick={() => alert('Opening: How to negotiate your salary in 2026')}>How to negotiate your salary in 2026</li>
              <li onClick={() => alert('Opening: The rise of agentic AI in the workplace')}>The rise of agentic AI in the workplace</li>
              <li onClick={() => alert('Opening: Mental health tips for tech professionals')}>Mental health tips for tech professionals</li>
            </ul>
          </div>
        </aside>
      </div>

      {/* Article Modal */}
      {selectedArticle && (
        <div className="modal-overlay" onClick={() => setSelectedArticle(null)}>
          <div className="modal-content" style={{ maxWidth: '600px', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <header className="modal-header" style={{ border: 'none', padding: '0 0 16px' }}>
              <h2 style={{ fontSize: '20px', margin: 0 }}>{selectedArticle.title}</h2>
              <button className="modal-close" onClick={() => setSelectedArticle(null)}>×</button>
            </header>
            <div className="modal-body" style={{ padding: 0 }}>
              <p style={{ color: 'var(--li-text-sec)', fontSize: '14px', marginBottom: '16px' }}>
                {selectedArticle.time} • {selectedArticle.viewers} readers
              </p>
              <div style={{ lineHeight: 1.8, fontSize: '16px', color: 'rgba(0,0,0,0.8)' }}>
                {selectedArticle.content}
              </div>
            </div>
            <footer className="modal-footer" style={{ border: 'none', padding: '24px 0 0' }}>
              <button className="primary" onClick={() => setSelectedArticle(null)}>Done Reading</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
