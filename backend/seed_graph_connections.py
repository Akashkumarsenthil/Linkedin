import sys
from pathlib import Path
from sqlalchemy import text
from tqdm import tqdm

# Add parent dir to path for imports
sys.path.insert(0, ".")
from database import engine, SessionLocal

def seed_snap_graph():
    graph_file = Path("../dataset_graphs/archive (4)/wiki-Vote.txt")
    if not graph_file.exists():
        print(f"Error: Could not find {graph_file}")
        return

    db = SessionLocal()
    print("Fetching valid member IDs from database...")
    mem_rows = db.execute(text("SELECT member_id FROM members")).fetchall()
    valid_members = {row[0] for row in mem_rows}

    if not valid_members:
        print("Error: No members found in database.")
        db.close()
        return

    print("Parsing SNAP Graph Dataset...")
    edges = set()
    with open(graph_file, "r") as f:
        for line in f:
            if line.startswith("#"):
                continue
            parts = line.strip().split()
            if len(parts) == 2:
                # Map SNAP nodes directly to our member IDs
                req = int(parts[0])
                rec = int(parts[1])
                # Only keep the edge if both nodes exist in our DB
                if req in valid_members and rec in valid_members and req != rec:
                    # Sort to prevent A->B and B->A duplicates since our connections are mutual
                    edge = tuple(sorted((req, rec)))
                    edges.add(edge)

    # Convert to list and limit to 10,000 realistic edges to avoid bloating
    edges = list(edges)[:10000]
    
    print(f"Found {len(edges)} valid realistic edges. Seeding connections...")
    
    # Batch insert to avoid huge transactions
    batch_size = 1000
    for i in tqdm(range(0, len(edges), batch_size)):
        batch = edges[i:i+batch_size]
        try:
            db.execute(
                text("INSERT IGNORE INTO connections (requester_id, receiver_id, status) VALUES (:req, :rec, 'accepted')"),
                [{"req": req, "rec": rec} for req, rec in batch]
            )
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Error inserting batch: {e}")

    print("✅ Successfully seeded realistic graph connections!")
    db.close()

if __name__ == "__main__":
    seed_snap_graph()
