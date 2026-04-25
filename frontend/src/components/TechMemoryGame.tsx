import { useState, useEffect } from 'react'

const TECH_LOGOS = ['React', 'Python', 'Docker', 'MySQL', 'Redis', 'Kafka']

export function TechMemoryGame() {
  const [cards, setCards] = useState<{ id: number; logo: string; flipped: boolean; matched: boolean }[]>([])
  const [flipped, setFlipped] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [won, setWon] = useState(false)

  const initGame = () => {
    const doubled = [...TECH_LOGOS, ...TECH_LOGOS]
    const shuffled = doubled
      .sort(() => Math.random() - 0.5)
      .map((logo, index) => ({ id: index, logo, flipped: false, matched: false }))
    setCards(shuffled)
    setFlipped([])
    setMoves(0)
    setWon(false)
  }

  useEffect(() => {
    initGame()
  }, [])

  const handleFlip = (id: number) => {
    if (flipped.length === 2 || cards[id].flipped || cards[id].matched) return
    
    const newCards = [...cards]
    newCards[id].flipped = true
    setCards(newCards)
    
    const nextFlipped = [...flipped, id]
    setFlipped(nextFlipped)

    if (nextFlipped.length === 2) {
      setMoves(m => m + 1)
      const [first, second] = nextFlipped
      if (cards[first].logo === cards[second].logo) {
        newCards[first].matched = true
        newCards[second].matched = true
        setCards(newCards)
        setFlipped([])
        if (newCards.every(c => c.matched)) setWon(true)
      } else {
        setTimeout(() => {
          newCards[first].flipped = false
          newCards[second].flipped = false
          setCards(newCards)
          setFlipped([])
        }, 1000)
      }
    }
  }

  return (
    <div className="li-card tech-game-card">
      <div className="game-header">
        <span className="game-title">Connect Memory</span>
        <span className="game-moves">Moves: {moves}</span>
      </div>
      
      {won ? (
        <div className="game-won">
          <p>Well done!</p>
          <button className="primary" onClick={initGame}>Play Again</button>
        </div>
      ) : (
        <div className="game-grid">
          {cards.map(card => (
            <div 
              key={card.id} 
              className={`game-card ${card.flipped || card.matched ? 'flipped' : ''}`}
              onClick={() => handleFlip(card.id)}
            >
              <div className="game-card-inner">
                <div className="game-card-front">?</div>
                <div className="game-card-back">{card.logo}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .tech-game-card { padding: 16px; margin-top: 12px; }
        .game-header { display: flex; justify-content: space-between; margin-bottom: 12px; font-weight: 700; font-size: 13px; }
        .game-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .game-card { aspect-ratio: 1; perspective: 1000px; cursor: pointer; }
        .game-card-inner { 
          position: relative; width: 100%; height: 100%; text-align: center; 
          transition: transform 0.4s; transform-style: preserve-3d; 
        }
        .game-card.flipped .game-card-inner { transform: rotateY(180deg); }
        .game-card-front, .game-card-back {
          position: absolute; width: 100%; height: 100%; backface-visibility: hidden;
          display: flex; align-items: center; justify-content: center; border-radius: 4px;
          font-size: 10px; font-weight: 800;
        }
        .game-card-front { background: #eef3f8; color: #0a66c2; border: 1px solid var(--border); box-shadow: inset 0 0 10px rgba(0,0,0,0.02); }
        .game-card-back { 
          background: linear-gradient(135deg, #0a66c2, #004182); 
          color: #fff; 
          transform: rotateY(180deg);
          box-shadow: 0 4px 12px rgba(10, 102, 194, 0.3);
        }
        .game-won { text-align: center; padding: 20px 0; }
        .game-won p { font-weight: 800; margin-bottom: 12px; color: #057642; }
      `}</style>
    </div>
  )
}
