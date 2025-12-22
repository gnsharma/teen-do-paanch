# Phase 2 Performance Optimizations

This document outlines advanced performance improvements for the 3-2-5 card game. These optimizations build on Phase 1 (debouncing + parallelization) and provide further latency reduction.

## Overview

| Optimization | Complexity | Impact |
|--------------|------------|--------|
| Direct payload processing | Medium | Eliminate redundant DB fetches |
| Optimistic UI updates | High | Instant visual feedback |
| Selective field queries | Low | Reduce data transfer |

---

## 1. Direct Payload Processing

### Problem
Currently, every subscription event triggers `loadGameState()` which fetches ALL data from the database, even though the subscription payload already contains the changed data.

### Current Flow
```
DB Change → Subscription Event (with payload) → Ignore payload → Fetch everything from DB
```

### Optimized Flow
```
DB Change → Subscription Event (with payload) → Update local state directly from payload
```

### Implementation

**File:** `src/pages/Game.tsx`

```typescript
// Instead of:
.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
  loadGameStateDebounced();
})

// Use:
.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
  if (payload.eventType === 'UPDATE' && payload.new) {
    setGameState(prev => prev ? { ...prev, ...payload.new } : prev);
  }
})

.on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, (payload) => {
  if (payload.eventType === 'UPDATE' && payload.new) {
    const updatedPlayer = payload.new;
    setPlayers(prev => prev.map(p =>
      p.position === updatedPlayer.position ? { ...p, ...updatedPlayer } : p
    ));
  }
})
```

### Considerations
- Need to handle all event types: INSERT, UPDATE, DELETE
- Initial load still requires `loadGameState()`
- Keep `loadGameState()` as fallback for reconnection scenarios

---

## 2. Optimistic UI Updates

### Problem
Users must wait for the full DB round-trip before seeing their action reflected in the UI.

### Current Flow
```
User plays card → Send to DB → Wait for DB → Wait for subscription → Update UI
```

### Optimized Flow
```
User plays card → Update UI immediately → Send to DB → Reconcile if needed
```

### Implementation

**File:** `src/pages/Game.tsx`

```typescript
const handlePlayCard = async (card: Card) => {
  // 1. Optimistic update - update UI immediately
  const myPlayer = players.find(p => p.position === myPosition);
  if (!myPlayer) return;

  const newHand = (myPlayer.hand as Card[]).filter(
    c => !(c.suit === card.suit && c.rank === card.rank)
  );

  const newTrick = [
    ...(gameState.current_trick as any[] || []),
    { position: myPosition, card }
  ];

  // Update local state immediately
  setPlayers(prev => prev.map(p =>
    p.position === myPosition ? { ...p, hand: newHand } : p
  ));
  setGameState(prev => prev ? {
    ...prev,
    current_trick: newTrick,
    current_player_index: (prev.current_player_index + 1) % 3
  } : prev);

  // 2. Send to database (don't await for UI)
  try {
    await Promise.all([
      supabase.from('players').update({ hand: newHand }).eq('room_id', roomId).eq('position', myPosition),
      supabase.from('rooms').update({
        current_trick: newTrick,
        current_player_index: (gameState.current_player_index + 1) % 3
      }).eq('id', roomId)
    ]);
  } catch (error) {
    // 3. Rollback on error
    console.error('Failed to play card:', error);
    loadGameState(); // Reload true state
    toast({ title: 'Failed to play card', variant: 'destructive' });
  }
};
```

### Considerations
- Need rollback mechanism for failed operations
- Must handle race conditions (e.g., two players trying to play simultaneously)
- Consider using a state machine library (XState) for complex state transitions

---

## 3. Selective Field Queries

### Problem
All queries use `select('*')` which fetches unnecessary fields and increases payload size.

### Current Code
```typescript
const { data: roomData } = await supabase
  .from('rooms')
  .select('*')
  .eq('id', roomId)
  .single();
```

### Optimized Code
```typescript
const { data: roomData } = await supabase
  .from('rooms')
  .select('id, status, dealer_index, trump_suit, current_trick, current_player_index, dealing_phase, round_number')
  .eq('id', roomId)
  .single();

const { data: playersData } = await supabase
  .from('players')
  .select('id, name, position, hand, tricks_won, target_tricks, total_score')
  .eq('room_id', roomId)
  .order('position');
```

### Fields to Query

**Rooms table:**
- `id`, `status`, `dealer_index`, `trump_suit`, `current_trick`, `current_player_index`, `dealing_phase`, `round_number`, `remaining_cards`

**Players table:**
- `id`, `name`, `position`, `hand`, `tricks_won`, `target_tricks`, `total_score`

---

## 4. Additional Optimizations (Optional)

### 4.1 Batch Subscription Updates
Accumulate multiple rapid changes and apply them in a single React state update:

```typescript
const pendingUpdates = useRef<any[]>([]);
const flushTimeout = useRef<NodeJS.Timeout>();

const queueUpdate = (update: any) => {
  pendingUpdates.current.push(update);

  if (flushTimeout.current) clearTimeout(flushTimeout.current);
  flushTimeout.current = setTimeout(() => {
    // Apply all pending updates at once
    const updates = pendingUpdates.current;
    pendingUpdates.current = [];

    setGameState(prev => {
      let state = prev;
      for (const update of updates) {
        state = { ...state, ...update };
      }
      return state;
    });
  }, 16); // ~1 frame at 60fps
};
```

### 4.2 React.memo for Card Components
Prevent unnecessary re-renders of card components:

```typescript
const CardComponent = React.memo(({ card, onClick, disabled }: CardProps) => {
  // ... card rendering
}, (prev, next) => {
  return prev.card.suit === next.card.suit &&
         prev.card.rank === next.card.rank &&
         prev.disabled === next.disabled;
});
```

### 4.3 Virtual Scrolling for Trick History
If displaying many past tricks, use virtualization:

```typescript
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={400}
  itemCount={tricks.length}
  itemSize={50}
>
  {({ index, style }) => (
    <TrickRow trick={tricks[index]} style={style} />
  )}
</FixedSizeList>
```

---

## Implementation Order

1. **Selective field queries** (lowest risk, immediate benefit)
2. **Direct payload processing** (medium complexity, significant benefit)
3. **Optimistic UI updates** (highest complexity, best UX improvement)
4. **Additional optimizations** (as needed based on profiling)

---

## Testing Checklist

After implementation:
- [ ] Card plays feel instant (< 50ms perceived)
- [ ] No visual glitches during rapid play
- [ ] State correctly reconciles after network errors
- [ ] Multiplayer state stays synchronized
- [ ] No memory leaks from subscriptions
- [ ] Works correctly on slow connections (simulate with DevTools)

---

## Metrics to Track

Before and after measurements:
- Time from card click to visual update
- Number of DB queries per action
- Payload size per query
- React re-render count per action
- Memory usage over extended play session
