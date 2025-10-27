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

// Generate a full deck for 3-2-5 (28 cards total: 7 cards × 4 suits, but each player gets 10)
export function createDeck(): Card[] {
  const suits: Suit[] = ['♠', '♥', '♦', '♣'];
  const ranks: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }

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
export function isValidMove(
  card: Card,
  hand: Card[],
  currentTrick: Array<{ position: number; card: Card }>
): boolean {
  // If no cards played yet, any card is valid
  if (currentTrick.length === 0) return true;

  const leadSuit = currentTrick[0].card.suit;
  
  // If player has cards of lead suit, must follow suit
  const hasSuit = hand.some(c => c.suit === leadSuit);
  if (hasSuit) {
    return card.suit === leadSuit;
  }

  // Otherwise, any card is valid
  return true;
}

// Set target tricks based on dealer position
export function getTargetTricks(position: number, dealerPosition: number): number {
  if (position === dealerPosition) return 5;
  if (position === (dealerPosition + 1) % 3) return 3;
  return 2;
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
