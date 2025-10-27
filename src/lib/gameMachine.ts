import { setup, assign } from 'xstate';
import { Card } from './gameLogic';

export interface GameContext {
  roomId: string | null;
  playerName: string;
  playerPosition: number | null;
  hand: Card[];
  currentTrick: Array<{ position: number; card: Card }>;
  trump: string | null;
  dealerIndex: number;
  currentPlayerIndex: number;
  players: Array<{ name: string; position: number; tricksWon: number; targetTricks: number }>;
  error: string | null;
}

export type GameEvent =
  | { type: 'JOIN_ROOM'; roomId: string; playerName: string }
  | { type: 'CREATE_ROOM'; playerName: string }
  | { type: 'ROOM_READY' }
  | { type: 'GAME_STARTED' }
  | { type: 'CARDS_DEALT'; hand: Card[] }
  | { type: 'TRUMP_SELECTED'; trump: string }
  | { type: 'PLAY_CARD'; card: Card }
  | { type: 'TRICK_COMPLETE'; winnerPosition: number }
  | { type: 'ROUND_END' }
  | { type: 'ERROR'; message: string };

export const gameMachine = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameEvent,
  },
}).createMachine({
  id: 'game',
  initial: 'lobby',
  context: {
    roomId: null,
    playerName: '',
    playerPosition: null,
    hand: [],
    currentTrick: [],
    trump: null,
    dealerIndex: 0,
    currentPlayerIndex: 0,
    players: [],
    error: null,
  },
  states: {
    lobby: {
      on: {
        JOIN_ROOM: {
          target: 'joining',
          actions: assign({
            roomId: ({ event }) => event.roomId,
            playerName: ({ event }) => event.playerName,
          }),
        },
        CREATE_ROOM: {
          target: 'creating',
          actions: assign({
            playerName: ({ event }) => event.playerName,
          }),
        },
      },
    },
    creating: {
      on: {
        ROOM_READY: 'waiting',
        ERROR: {
          target: 'lobby',
          actions: assign({ error: ({ event }) => event.message }),
        },
      },
    },
    joining: {
      on: {
        ROOM_READY: 'waiting',
        ERROR: {
          target: 'lobby',
          actions: assign({ error: ({ event }) => event.message }),
        },
      },
    },
    waiting: {
      on: {
        GAME_STARTED: 'dealing',
      },
    },
    dealing: {
      on: {
        CARDS_DEALT: {
          target: 'trumpSelection',
          actions: assign({
            hand: ({ event }) => event.hand,
          }),
        },
      },
    },
    trumpSelection: {
      on: {
        TRUMP_SELECTED: {
          target: 'playing',
          actions: assign({
            trump: ({ event }) => event.trump,
          }),
        },
      },
    },
    playing: {
      on: {
        PLAY_CARD: {
          target: 'playing',
          actions: assign({
            currentTrick: ({ context, event }) => [
              ...context.currentTrick,
              { position: context.playerPosition!, card: event.card },
            ],
            hand: ({ context, event }) =>
              context.hand.filter(c => !(c.suit === event.card.suit && c.rank === event.card.rank)),
          }),
        },
        TRICK_COMPLETE: {
          target: 'playing',
          actions: assign({
            currentTrick: () => [],
            currentPlayerIndex: ({ event }) => event.winnerPosition,
          }),
        },
        ROUND_END: 'finished',
      },
    },
    finished: {
      type: 'final',
    },
  },
});
