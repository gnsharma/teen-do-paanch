export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Player {
  id: string;
  name: string;
  position: number;
  hand: Card[];
  tricksWon: number;
  targetTricks: number;
}

// Card rank values for comparison
const rankValues: Record<Rank, number> = {
  'A': 14,
  'K': 13,
  'Q': 12,
  'J': 11,
  '10': 10,
  '9': 9,
  '8': 8,
  '7': 7,
};

// Generate a full deck for 3-2-5 (30 cards total: 7 ranks × 4 suits + 2 sevens)
export function createDeck(): Card[] {
  const suits: Suit[] = ['♠', '♥', '♦', '♣'];
  const ranks: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8'];
  const deck: Card[] = [];

  // Add all cards except 7s first
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }

  // Add only 7 of spades and 7 of hearts (remove other 7s to make 30 cards)
  deck.push({ suit: '♠', rank: '7' });
  deck.push({ suit: '♥', rank: '7' });

  return deck;
}

// Shuffle array using Fisher-Yates
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Deal 10 cards to each of 3 players
export function dealCards(): Card[][] {
  const deck = shuffle(createDeck());
  const hands: Card[][] = [[], [], []];
  
  // Deal 10 cards to each player
  for (let i = 0; i < 10; i++) {
    for (let player = 0; player < 3; player++) {
      hands[player].push(deck[i * 3 + player]);
    }
  }
  
  return hands;
}

// Determine winner of a trick
export function evaluateTrick(
  cardsPlayed: Array<{ position: number; card: Card }>,
  trump: Suit | null
): number {
  if (cardsPlayed.length === 0) return -1;

  const leadSuit = cardsPlayed[0].card.suit;
  let winningIndex = 0;
  let winningCard = cardsPlayed[0].card;

  for (let i = 1; i < cardsPlayed.length; i++) {
    const currentCard = cardsPlayed[i].card;
    
    // Trump always wins over non-trump
    if (trump && currentCard.suit === trump && winningCard.suit !== trump) {
      winningIndex = i;
      winningCard = currentCard;
    }
    // Both trump: higher rank wins
    else if (trump && currentCard.suit === trump && winningCard.suit === trump) {
      if (rankValues[currentCard.rank] > rankValues[winningCard.rank]) {
        winningIndex = i;
        winningCard = currentCard;
      }
    }
    // Same suit as lead (and not trump): higher rank wins
    else if (currentCard.suit === leadSuit && winningCard.suit === leadSuit && winningCard.suit !== trump) {
      if (rankValues[currentCard.rank] > rankValues[winningCard.rank]) {
        winningIndex = i;
        winningCard = currentCard;
      }
    }
  }

  return cardsPlayed[winningIndex].position;
}

// Check if a card play is valid
// Returns { valid: boolean, reason?: string } for better error messages
// trickIndex: 0-9, which trick of the round (0 = first trick)
// trumpLedAtStart: whether trump was led on the first trick of this round
export function isValidMove(
  card: Card,
  hand: Card[],
  currentTrick: Array<{ position: number; card: Card }>,
  trump: Suit | null,
  trickIndex: number = 0,
  trumpLedAtStart: boolean | null = null
): { valid: boolean; reason?: string } {
  // Leading a trick
  if (currentTrick.length === 0) {
    // Case A: First trick of the round - trump allowed freely
    if (trickIndex === 0) {
      return { valid: true };
    }

    // Case B: Subsequent tricks
    if (trumpLedAtStart === true) {
      // Trump was led on first trick - must lead trump if you have any
      if (trump && card.suit !== trump) {
        const hasTrump = hand.some(c => c.suit === trump);
        if (hasTrump) {
          return { valid: false, reason: 'Must lead trump (trump was led in first trick)' };
        }
      }
      return { valid: true };
    } else {
      // Trump was NOT led on first trick - cannot lead trump unless no other cards
      if (trump && card.suit === trump) {
        const hasNonTrump = hand.some(c => c.suit !== trump);
        if (hasNonTrump) {
          return { valid: false, reason: 'Cannot lead with trump unless you have no other cards' };
        }
      }
      return { valid: true };
    }
  }

  const leadSuit = currentTrick[0].card.suit;

  // If player has cards of lead suit, must follow suit
  const hasSuit = hand.some(c => c.suit === leadSuit);
  if (hasSuit) {
    if (card.suit !== leadSuit) {
      return { valid: false, reason: 'Must follow suit' };
    }
  }

  return { valid: true };
}

// Set target tricks based on dealer position
// Dealer = 2 tricks, (dealer+1) = 5 tricks (chooses trump, leads first), (dealer+2) = 3 tricks
export function getTargetTricks(position: number, dealerPosition: number): number {
  if (position === dealerPosition) return 2;                    // Dealer = 2 tricks
  if (position === (dealerPosition + 1) % 3) return 5;          // Next = 5 tricks (trump chooser, first leader)
  return 3;                                                      // Last = 3 tricks
}

// Get the position of the 5-trick player (who chooses trump and leads first trick)
export function getFiveTrickPlayerPosition(dealerPosition: number): number {
  return (dealerPosition + 1) % 3;
}

export function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function stringToCard(str: string): Card | null {
  if (str.length < 2) return null;
  const suit = str[str.length - 1] as Suit;
  const rank = str.slice(0, -1) as Rank;
  return { suit, rank };
}
