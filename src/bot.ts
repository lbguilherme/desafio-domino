export interface PlayRequest {
  jogador: number;
  mao: string[];
  mesa: string[];
  jogadas: {
    jogador: number;
    pedra: string;
    lado?: "esquerda" | "direita";
  }[];
}

const allPieces: number[] = [];
const pieceNameToId: Record<string, number> = {};
const pieceIdToName: string[] = [];
const pieceOtherEnd = new Int32Array(1000);
const pieceSum = new Int32Array(100);

for (let i = 0; i < pieceOtherEnd.length; ++i) {
  pieceOtherEnd[i] = -1;
}

for (let i = 0; i <= 6; i++) {
  for (let j = i; j <= 6; j++) {
    const id = 1 + i * 7 + j;
    allPieces.push(id);
    pieceNameToId[`${i}-${j}`] = id;
    pieceNameToId[`${j}-${i}`] = id;
    pieceIdToName[id] = `${i}-${j}`;
    pieceOtherEnd[id*8+i] = j;
    pieceOtherEnd[id*8+j] = i;
    pieceSum[id] = i + j;
  }
}

function shuffleArray(arr: unknown[]) {
  for (let i = 0; i < arr.length; i++) {
    const j = Math.floor(Math.random() * arr.length);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

class State {
  end1: number;
  end2: number;
  hands: number[][];
  player: number; // 1-4
  lastMovePlayer: number; // 1-4

  constructor(end1: number, end2: number, hands: number[][], player: number, lastMovePlayer: number) {
    this.end1 = end1;
    this.end2 = end2;
    this.hands = hands;
    this.player = player;
    this.lastMovePlayer = lastMovePlayer;
  }

  positionScore(a: number, b: number): number {
    const previousPlayer = this.player === 1 ? 4 : this.player - 1;

    if (this.hands[previousPlayer - 1].every(p => p === 0)) {
      return -100000;
    }

    if (this.hands.every(h =>
      !h.some(piece =>
        piece && (pieceOtherEnd[piece*8+this.end1] !== -1 || pieceOtherEnd[piece*8+this.end2] !== -1)
      )
    )) {
      const handSum = this.hands.map(h => h.reduce((a, b) => a + pieceSum[b], 0));
      const mySum = this.player === 1 || this.player === 3 ? handSum[0] + handSum[2] : handSum[1] + handSum[3];
      const otherSum = this.player === 1 || this.player === 3 ? handSum[1] + handSum[3] : handSum[0] + handSum[2];

      if (mySum < otherSum) return -100000;
      if (mySum > otherSum) return 100000;

      if ((this.player === 1 || this.player === 3) === (this.lastMovePlayer === 1 || this.lastMovePlayer === 3)) {
        return -100000;
      } else {
        return 100000;
      }
    }

    const moves = this.validMoves();

    let bestScore = -Infinity;

    for (const move of moves) {
      this.doMove(move);
      bestScore = Math.max(bestScore, -this.positionScore(-b, -a));
      this.undoMove(move);
      a = Math.max(a, bestScore);

      if (bestScore === 100000 || a >= b) {
        break;
      }
    }

    return bestScore;
  }

  playedPieceStack: number[] = [];
  movedPlayerStack: number[] = [];

  doMove(move: number) {
    let piece: number;

    if (move > 0) {
      piece = this.hands[this.player - 1][move - 1]!;
      this.hands[this.player - 1][move - 1] = 0;
      this.end2 = pieceOtherEnd[piece*8+this.end2];
      this.playedPieceStack.push(piece);
    } else if (move < 0) {
      piece = this.hands[this.player - 1][-move - 1]!;
      this.hands[this.player - 1][-move - 1] = 0;
      this.end1 = pieceOtherEnd[piece*8+this.end1];
      this.playedPieceStack.push(piece);
    }

    if (move !== 0) {
      this.movedPlayerStack.push(this.lastMovePlayer);
      this.lastMovePlayer = this.player;
    }

    this.player += 1;
    if (this.player > 4) this.player = 1;
  }

  undoMove(move: number) {
    this.player -= 1;
    if (this.player < 1) this.player = 4;

    if (move > 0) {
      const piece = this.playedPieceStack.pop()!;
      this.hands[this.player - 1][move - 1] = piece;
      this.end2 = pieceOtherEnd[piece*8+this.end2];
    } else if (move < 0) {
      const piece = this.playedPieceStack.pop()!;
      this.hands[this.player - 1][-move - 1] = piece;
      this.end1 = pieceOtherEnd[piece*8+this.end1];
    }

    if (move !== 0) {
      this.lastMovePlayer = this.movedPlayerStack.pop()!;
    }

    this.player = this.player;
  }

  validMoves(): number[] {
    const moves: number[] = [];
    const hand = this.hands[this.player - 1];
    for (let i = 0; i < hand.length; i++) {
      const piece = hand[i];
      if (pieceOtherEnd[piece*8+this.end2] !== -1) {
        moves.push(i+1);
      }
      if (pieceOtherEnd[piece*8+this.end1] !== -1) {
        moves.push(-(i+1));
      }
    }
    if (moves.length === 0) {
      moves.push(0);
    }
    return moves;
  }

  findBestMoves() {
    const moves = this.validMoves();

    let bestScore = -Infinity;
    let bestMoves: number[] = [];

    for (const move of moves) {
      this.doMove(move);
      const moveScore = -this.positionScore(-Infinity, Infinity);
      if (moveScore > bestScore) {
        bestScore = moveScore;
        bestMoves = [move];
      } else if (moveScore === bestScore) {
        bestMoves.push(move);
      }
      this.undoMove(move);
    }
    return { bestScore, bestMoves };
  }
}

export function smartBot(req: PlayRequest) {
  const start = performance.now();
  const remaininigPieces = new Set(allPieces);
  const handSize = [7, 7, 7, 7];
  const denyList: Set<number>[] = [new Set(), new Set(), new Set(), new Set()];
  let expectedPlayer = req.jogadas[0].jogador;
  let end1 = 6;
  let end2 = 6;

  for (const pl of req.jogadas) {
    while (expectedPlayer !== pl.jogador) {
      for (const id of allPieces) {
        if (pieceOtherEnd[id*8+end1] !== -1 || pieceOtherEnd[id*8+end2] !== -1) {
          denyList[expectedPlayer - 1].add(id);
        }
      }

      expectedPlayer += 1;
      if (expectedPlayer > 4) expectedPlayer = 1;
    }

    if (pl.lado === "direita") {
      end2 = pieceOtherEnd[pieceNameToId[pl.pedra]*8+end2];
    } else {
      end1 = pieceOtherEnd[pieceNameToId[pl.pedra]*8+end1];
    }

    remaininigPieces.delete(pieceNameToId[pl.pedra]);
    handSize[pl.jogador - 1]--;

    expectedPlayer += 1;
    if (expectedPlayer > 4) expectedPlayer = 1;
  }

  for (const p of req.mao) {
    remaininigPieces.delete(pieceNameToId[p]);
  }

  const bestMoveCount = new Map<number, number>();

  const hands: number[][] = [];

  hands[req.jogador - 1] = req.mao.map(p => pieceNameToId[p]);
  handSize[req.jogador - 1] = 0;

  while (performance.now() - start < 1000) {
    let foundDistribution = false;
    while (!foundDistribution) {
      foundDistribution = true;
      const usedPieces = new Set<number>();
      for (let i = 0; i < 4; ++i) {
        if (i === req.jogador - 1) continue;
        const acceptablePieces = Array.from(remaininigPieces).filter(p => !denyList[i].has(p) && !usedPieces.has(p));
        shuffleArray(acceptablePieces);

        if (acceptablePieces.length < handSize[i]) {
          foundDistribution = false;
          break;
        }

        hands[i] = acceptablePieces.slice(0, handSize[i]);
        for (const p of hands[i]) {
          usedPieces.add(p);
        }
      }
    }

    const state = new State(end1, end2, hands, req.jogador, req.jogadas.at(-1)!.jogador);

    const { bestScore, bestMoves } = state.findBestMoves();

    for (const move of bestMoves) {
      bestMoveCount.set(move, (bestMoveCount.get(move) ?? 0) + (bestScore > 0 ? 100 : 1));
    }
  }

  const bestMove = Array.from(bestMoveCount.entries()).sort((a, b) => b[1] - a[1])[0][0];

  if (bestMove === 0) {
    return {}
  }

  return {
    pedra: req.mao[Math.abs(bestMove) - 1],
    lado: bestMove > 0 ? "direita" : "esquerda",
  }
}
