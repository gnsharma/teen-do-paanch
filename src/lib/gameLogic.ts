/**
 * ============================================================================
 * 3-2-5 (Teen Do Paanch) Game Logic
 * ============================================================================
 *
 * OVERVIEW:
 * - 3 players, 30 cards (standard deck minus 7♦ and 7♣)
 * - Each round: players try to win exactly their target tricks
 * - First to reach +5 cumulative overachievement wins the game
 *
 * TARGET TRICKS (per round):
 * - Dealer: 2 tricks
 * - Player after dealer (clockwise): 5 tricks (also picks trump, leads first)
 * - Third player: 3 tricks
 *
 * DEALING (3 phases):
 * 1. Deal 5 cards to each player
 * 2. 5-trick player picks trump suit
 * 3. Deal 3 more cards to each player
 * 4. Deal final 2 cards (10 cards total each)
 *
 * PLAYING RULES:
 * - Must follow suit if you have cards of the lead suit
 * - Trump beats any non-trump card
 * - Higher rank wins within same suit
 * - First trick: can lead ANY card (including trump)
 * - Later tricks: trump leading rules apply (see isValidMove)
 *
 * CARD PULL (only after round 1):
 * - Happens when someone over-achieved AND someone under-achieved
 * - Over-achievers pull cards from under-achievers (1 pull per extra trick)
 * - Return rules: same card, same suit, or different suit (if keeping 2+ of it)
 *
 * GAME STATE FLOW:
 * waiting → dealing/trump_selection → dealing/dealing_3 → [card_pull?] → playing → redistribution → (repeat or finished)
 *
 * ============================================================================
 */

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// CONSTANTS
// ============================================================================

/** Card rank values for comparison (Ace high) */
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

// ============================================================================
// DECK OPERATIONS
// ============================================================================

/**
 * Creates the 30-card deck used in 3-2-5.
 * Standard 52-card deck minus: 2-6 of all suits, and 7♦ and 7♣
 * Remaining: A-K-Q-J-10-9-8 of all suits + 7♠ + 7♥ = 28 + 2 = 30 cards
 */
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

/** Shuffle array using Fisher-Yates algorithm */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Deal 10 cards to each of 3 players (used for initial full deal) */
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

// ============================================================================
// TRICK EVALUATION
// ============================================================================

/**
 * Determines the winner of a trick.
 *
 * WINNING RULES (in order of priority):
 * 1. Trump cards beat all non-trump cards
 * 2. Among trump cards, highest rank wins
 * 3. Among non-trump cards, highest card of the lead suit wins
 * 4. Cards that don't match lead suit or trump lose
 */
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

// ============================================================================
// MOVE VALIDATION
// ============================================================================

/** Check if player has any cards of a specific suit */
function hasCardsOfSuit(hand: Card[], suit: Suit): boolean {
  return hand.some(c => c.suit === suit);
}

/** Check if player is following suit correctly */
function isFollowingSuit(card: Card, leadSuit: Suit): boolean {
  return card.suit === leadSuit;
}

/**
 * Validates trump-leading rules for tricks after the first one.
 *
 * THE TRUMP LEADING RULE:
 * - If trump was led on the FIRST trick of the round → you MUST lead trump on later tricks (if you have any)
 * - If non-trump was led on the first trick → you CANNOT lead trump (unless you only have trump left)
 *
 * This rule creates interesting strategy: the first player's choice affects the entire round.
 */
function validateTrumpLeadingRules(
  card: Card,
  hand: Card[],
  trump: Suit,
  trumpLedAtStart: boolean | null
): { valid: boolean; reason?: string } {
  const isPlayingTrump = card.suit === trump;
  const hasTrump = hasCardsOfSuit(hand, trump);
  const hasNonTrump = hand.some(c => c.suit !== trump);

  if (trumpLedAtStart === true) {
    // RULE: Trump was led first → must lead trump if you have any
    if (!isPlayingTrump && hasTrump) {
      return { valid: false, reason: 'Must lead trump (trump was led in first trick)' };
    }
  } else {
    // RULE: Non-trump was led first → cannot lead trump unless forced
    if (isPlayingTrump && hasNonTrump) {
      return { valid: false, reason: 'Cannot lead with trump unless you have no other cards' };
    }
  }

  return { valid: true };
}

/**
 * Validates if playing a card is legal.
 *
 * @param card - The card being played
 * @param hand - Player's current hand
 * @param currentTrick - Cards already played in this trick
 * @param trump - The trump suit for this round
 * @param trickIndex - Which trick (0-9) in the round
 * @param trumpLedAtStart - Was trump led on the first trick of this round?
 */
export function isValidMove(
  card: Card,
  hand: Card[],
  currentTrick: Array<{ position: number; card: Card }>,
  trump: Suit | null,
  trickIndex: number = 0,
  trumpLedAtStart: boolean | null = null
): { valid: boolean; reason?: string } {
  const isLeading = currentTrick.length === 0;

  // ----------------------------------------
  // CASE 1: LEADING A TRICK
  // ----------------------------------------
  if (isLeading) {
    // First trick of round: no restrictions, can lead anything
    if (trickIndex === 0) {
      return { valid: true };
    }

    // Later tricks: trump leading rules apply
    if (trump) {
      return validateTrumpLeadingRules(card, hand, trump, trumpLedAtStart);
    }

    return { valid: true };
  }

  // ----------------------------------------
  // CASE 2: FOLLOWING IN A TRICK
  // ----------------------------------------
  const leadSuit = currentTrick[0].card.suit;

  // RULE: Must follow suit if you can
  if (hasCardsOfSuit(hand, leadSuit) && !isFollowingSuit(card, leadSuit)) {
    return { valid: false, reason: 'Must follow suit' };
  }

  // If you can't follow suit, you can play anything (including trump)
  return { valid: true };
}

// ============================================================================
// PLAYER TARGETS & POSITIONS
// ============================================================================

/**
 * Returns the target tricks for a player based on dealer position.
 * - Dealer: 2 tricks (hardest position)
 * - Dealer+1 (clockwise): 5 tricks (picks trump, leads first)
 * - Dealer+2: 3 tricks
 */
export function getTargetTricks(position: number, dealerPosition: number): number {
  if (position === dealerPosition) return 2;
  if (position === (dealerPosition + 1) % 3) return 5;
  return 3;
}

/** Returns the position of the 5-trick player (picks trump and leads first) */
export function getFiveTrickPlayerPosition(dealerPosition: number): number {
  return (dealerPosition + 1) % 3;
}

// ============================================================================
// CARD UTILITIES
// ============================================================================

export function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function stringToCard(str: string): Card | null {
  if (str.length < 2) return null;
  const suit = str[str.length - 1] as Suit;
  const rank = str.slice(0, -1) as Rank;
  return { suit, rank };
}

// ============================================================================
// CARD PULL (Extra Trick Adjustment)
// ============================================================================
//
// Card pull happens AFTER round 1 when:
// - At least one player WON MORE tricks than their target (over-scorer)
// - At least one player WON FEWER tricks than their target (under-scorer)
//
// PROCESS:
// 1. Over-scorers get 1 pull per extra trick they won
// 2. They choose an under-scorer's hand (face-down)
// 3. They blindly select a card position
// 4. They see the card and return one from their own hand
//
// RETURN RULES:
// - Can always return the exact same card
// - Can return any card of the same suit
// - Can return a different suit ONLY if keeping 2+ cards of that suit
//
// ORDER: By extra tricks (descending), then clockwise from dealer
//
// ============================================================================

/** Previous round result for calculating card pull eligibility */
export interface PreviousRoundResult {
  position: number;
  tricksWon: number;
  targetTricks: number;
}

/** A player who over-achieved and gets to pull cards */
export interface Puller {
  position: number;
  extraTricks: number;      // How many extra tricks they won
  pullsRemaining: number;   // How many more pulls they can make
}

/** A player who under-achieved and loses cards */
export interface UnderScorer {
  position: number;
}

/**
 * Card pull phase state machine:
 * selecting_target → selecting_card → returning_card → (repeat or complete)
 */
export type CardPullPhase = 'selecting_target' | 'selecting_card' | 'returning_card' | 'complete';

/** Complete state of the card pull process */
export interface CardPullState {
  pullers: Puller[];              // All players who can pull
  underScorers: UnderScorer[];    // All players being pulled from
  currentPullerIndex: number;     // Which puller is active
  phase: CardPullPhase;           // Current phase
  selectedTarget: number | null;  // Position of target player
  pulledCard: Card | null;        // The card that was pulled
  pulledCardIndex: number | null; // Index of pulled card in target's hand
}

/**
 * Determines which players are over-scorers (get to pull) and under-scorers (get pulled from).
 *
 * SORTING OVER-SCORERS:
 * 1. By extra tricks (most first)
 * 2. Tie-breaker: clockwise from dealer (dealer+1 goes first)
 */
export function calculatePullEligibility(
  previousResults: PreviousRoundResult[],
  dealerIndex: number
): { overScorers: Puller[]; underScorers: UnderScorer[] } {
  const overScorers: Puller[] = [];
  const underScorers: UnderScorer[] = [];

  // Categorize each player
  for (const result of previousResults) {
    const diff = result.tricksWon - result.targetTricks;
    if (diff > 0) {
      overScorers.push({
        position: result.position,
        extraTricks: diff,
        pullsRemaining: diff  // Gets 1 pull per extra trick
      });
    } else if (diff < 0) {
      underScorers.push({ position: result.position });
    }
    // diff === 0: player met target exactly, not involved in card pull
  }

  // Sort over-scorers by priority
  overScorers.sort((a, b) => {
    // Primary: more extra tricks → higher priority
    if (b.extraTricks !== a.extraTricks) {
      return b.extraTricks - a.extraTricks;
    }
    // Secondary: clockwise distance from dealer (smaller distance = higher priority)
    // Example: if dealer is position 1, order is 2, 0, 1
    const aDistance = (a.position - dealerIndex + 3) % 3;
    const bDistance = (b.position - dealerIndex + 3) % 3;
    return aDistance - bDistance;
  });

  return { overScorers, underScorers };
}

/** Creates initial card pull state to start the process */
export function initializeCardPullState(
  overScorers: Puller[],
  underScorers: UnderScorer[]
): CardPullState {
  return {
    pullers: overScorers,
    underScorers,
    currentPullerIndex: 0,
    phase: 'selecting_target',
    selectedTarget: null,
    pulledCard: null,
    pulledCardIndex: null
  };
}

/**
 * Validates if a card can be returned during card pull.
 *
 * RETURN RULES (in order checked):
 * 1. SAME CARD: Can always give back the exact card pulled → valid
 * 2. SAME SUIT: Can give any card of the pulled card's suit → valid
 * 3. DIFFERENT SUIT: Only if you keep 2+ cards of that suit after returning
 *
 * Rule 3 prevents someone from emptying a suit to avoid following it later.
 */
export function canReturnCard(
  returnCard: Card,
  pulledCard: Card,
  currentHand: Card[]
): { valid: boolean; reason?: string } {
  const isSameCard = returnCard.suit === pulledCard.suit && returnCard.rank === pulledCard.rank;
  const isSameSuit = returnCard.suit === pulledCard.suit;

  // Rule 1: Can always return the same card
  if (isSameCard) {
    return { valid: true };
  }

  // Rule 2: Can return any card of the same suit
  if (isSameSuit) {
    return { valid: true };
  }

  // Rule 3: Different suit - must keep at least 2 of that suit
  const cardsOfReturnSuit = currentHand.filter(c => c.suit === returnCard.suit);
  const cardsRemainingAfterReturn = cardsOfReturnSuit.length - 1;

  if (cardsRemainingAfterReturn >= 2) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Cannot return ${returnCard.rank}${returnCard.suit}: must keep at least 2 cards of ${returnCard.suit}`
  };
}

/** Returns all cards from hand that can be legally returned */
export function getValidReturnCards(
  pulledCard: Card,
  currentHand: Card[]
): Card[] {
  return currentHand.filter(card => canReturnCard(card, pulledCard, currentHand).valid);
}
