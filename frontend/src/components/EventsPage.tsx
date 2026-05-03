import { useState, useEffect } from 'react'
import { Icon } from './Icon'

interface Event {
  id: string
  title: string
  date: string // ISO date string
  time: string
  description?: string
}

export function EventsPage({ userId }: { userId?: number }) {
  const [events, setEvents] = useState<Event[]>(() => {
    const key = userId ? `ln-events-data-${userId}` : 'ln-events-data'
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : []
  })
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEvent, setNewEvent] = useState<Partial<Event>>({ title: '', date: '', time: '', description: '' })

  useEffect(() => {
    const dataKey = userId ? `ln-events-data-${userId}` : 'ln-events-data'
    const simsonKey = userId ? `ln-events-${userId}` : 'ln-events'
    
    localStorage.setItem(dataKey, JSON.stringify(events))
    // Also sync with ln-events for SIMSON
    const simsonEvents = events.map(e => `${e.date} ${e.time}: ${e.title}`).join('. ')
    localStorage.setItem(simsonKey, simsonEvents)
  }, [events, userId])

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthName = currentDate.toLocaleString('default', { month: 'long' })

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const handleAddEvent = () => {
    if (!newEvent.title || !newEvent.date) return
    const id = Math.random().toString(36).substr(2, 9)
    setEvents([...events, { ...newEvent, id } as Event])
    setShowAddModal(false)
    setNewEvent({ title: '', date: '', time: '', description: '' })
  }

  const handleDeleteEvent = (id: string) => {
    setEvents(events.filter(e => e.id !== id))
  }

  const renderCalendar = () => {
    const totalDays = daysInMonth(year, month)
    const firstDay = firstDayOfMonth(year, month)
    const grid = []

    // Padding for first week
    for (let i = 0; i < firstDay; i++) {
      grid.push(<div key={`pad-${i}`} className="calendar-day empty" />)
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayEvents = events.filter(e => e.date === dateStr)
      const isToday = new Date().toDateString() === new Date(year, month, day).toDateString()

      grid.push(
        <div key={day} className={`calendar-day ${isToday ? 'today' : ''}`} onClick={() => { setNewEvent({ ...newEvent, date: dateStr }); setShowAddModal(true); }}>
          <span className="day-num">{day}</span>
          <div className="day-events">
            {dayEvents.map(e => (
              <div key={e.id} className="event-pill" title={e.title}>
                {e.title}
                <button className="del-event" onClick={(ev) => { ev.stopPropagation(); handleDeleteEvent(e.id); }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )
    }

    return grid
  }

  return (
    <div className="events-page premium-panel">
      <header className="events-header premium-header">
        <div>
          <h2 className="premium-title">Events</h2>
          <p className="premium-subtitle">Plan and schedule your professional gatherings</p>
        </div>
        <button className="primary" onClick={() => setShowAddModal(true)}>+ Create Event</button>
      </header>

        <div className="calendar-nav">
          <div className="nav-info">
            <h2>{monthName} {year}</h2>
            <div className="nav-btns">
              <button onClick={handlePrevMonth}>‹</button>
              <button onClick={() => setCurrentDate(new Date())}>Today</button>
              <button onClick={handleNextMonth}>›</button>
            </div>
          </div>
        </div>

        <div className="calendar-grid-header">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="calendar-grid">
          {renderCalendar()}
        </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content event-modal" onClick={e => e.stopPropagation()}>
            <header className="modal-header">
              <h3>Create Event</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </header>
            <div className="modal-body">
              <div className="form-group">
                <label>Event Title</label>
                <input 
                  type="text" 
                  value={newEvent.title} 
                  onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} 
                  placeholder="e.g. Portfolio Review"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input 
                    type="date" 
                    value={newEvent.date} 
                    onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} 
                  />
                </div>
                <div className="form-group">
                  <label>Time</label>
                  <input 
                    type="time" 
                    value={newEvent.time} 
                    onChange={e => setNewEvent({ ...newEvent, time: e.target.value })} 
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <textarea 
                  rows={3} 
                  value={newEvent.description} 
                  onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Add details..."
                />
              </div>
            </div>
            <footer className="modal-footer">
              <button className="secondary-btn" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="primary" onClick={handleAddEvent}>Save Event</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
