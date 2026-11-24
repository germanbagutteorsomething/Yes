import React from 'react';
import type { PieceSymbol } from 'chess.js';
import type { PieceSet, PlayerColor } from '../types/chess';

interface ChessPieceSvgProps {
  type: PieceSymbol;
  color: PlayerColor;
  pieceSet?: PieceSet;
  className?: string;
}

const NeoPieceSvg: React.FC<{
  type: PieceSymbol;
  color: PlayerColor;
  className: string;
}> = ({ type, color, className }) => {
  const isWhite = color === 'w';
  const fill = isWhite ? '#FCFBF8' : '#1E1C1A';
  const stroke = isWhite ? '#292524' : '#0C0A09';
  const accent = isWhite ? '#D6D3D1' : '#57534E';

  switch (type) {
    case 'p':
      return (
        <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
          <circle cx="22.5" cy="14" r="6" fill={fill} stroke={stroke} strokeWidth="2" />
          <path
            d="M14 37h17l-2.5-9.5c-1-3.5-3.2-5-6-5s-5 1.5-6 5L14 37z"
            fill={fill}
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <rect x="12" y="36" width="21" height="4" rx="2" fill={fill} stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case 'r':
      return (
        <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
          <path
            d="M12 10h5v4h3v-4h5v4h3v-4h5v8l-3 3v12l3 3v4H12v-4l3-3V21l-3-3v-8z"
            fill={fill}
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M16 21h13M15 33h15" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'n':
      return (
        <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
          <path
            d="M14 39h19c0-11-3-19-9-25l-2-5-4 3c-5 2-9 7-10 12l5 2 4-3c-1 5-3 8-3 16z"
            fill={fill}
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="17.5" cy="16.5" r="1.4" fill={isWhite ? '#1C1917' : '#F5F5F4'} />
          <rect x="12" y="36" width="22" height="4" rx="2" fill={fill} stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case 'b':
      return (
        <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
          <circle cx="22.5" cy="8.5" r="2.8" fill={fill} stroke={stroke} strokeWidth="1.8" />
          <path
            d="M22.5 11.5c-6.5 4.5-8 11.5-5 18l-3.5 6.5h17L27.5 29.5c3-6.5 1.5-13.5-5-18z"
            fill={fill}
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M19 21l7 5" stroke={isWhite ? '#292524' : '#E7E5E4'} strokeWidth="2" strokeLinecap="round" />
          <rect x="12" y="36" width="21" height="4" rx="2" fill={fill} stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case 'q':
      return (
        <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
          <circle cx="9" cy="14" r="2.2" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <circle cx="16" cy="10" r="2.2" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <circle cx="22.5" cy="8.5" r="2.4" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <circle cx="29" cy="10" r="2.2" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <circle cx="36" cy="14" r="2.2" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <path
            d="M10 16l4 18h17l4-18-7 9-5.5-13-5.5 13-7-9z"
            fill={fill}
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <rect x="12" y="35" width="21" height="4.5" rx="2" fill={fill} stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
    case 'k':
      return (
        <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
          <path d="M22.5 6v7M19 9.5h7" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
          <path
            d="M14 35h17l3-12c1-4-2-7-6-7-2.8 0-4.6 1.5-5.5 3.5-.9-2-2.7-3.5-5.5-3.5-4 0-7 3-6 7l3 12z"
            fill={fill}
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <rect x="12" y="35" width="21" height="4.5" rx="2" fill={fill} stroke={stroke} strokeWidth="1.8" />
        </svg>
      );
  }
};

const PIXEL_GRIDS: Record<PieceSymbol, string[]> = {
  p: [
    '................',
    '................',
    '......XXXX......',
    '.....XOOOOX.....',
    '.....XOOOOX.....',
    '......XXXX......',
    '.....XOOOOX.....',
    '......XOOX......',
    '.....XOOOOX.....',
    '....XOOOOOOX....',
    '....XOOOOOOX....',
    '...XOOOOOOOOX...',
    '...XXXXXXXXXX...',
    '..XOOOOOOOOOOX..',
    '..XXXXXXXXXXXX..',
    '................',
  ],
  r: [
    '................',
    '..XXX..XX..XXX..',
    '..XOX..OX..XOX..',
    '..XOOOOOOOOOOX..',
    '...XOOOOOOOOX...',
    '....XOOOOOOX....',
    '....XOOOOOOX....',
    '....XOOOOOOX....',
    '....XOOOOOOX....',
    '....XOOOOOOX....',
    '...XOOOOOOOOX...',
    '..XOOOOOOOOOOX..',
    '..XXXXXXXXXXXX..',
    '..XOOOOOOOOOOX..',
    '..XXXXXXXXXXXX..',
    '................',
  ],
  n: [
    '................',
    '.....XXXX.......',
    '....XOOOOXX.....',
    '...XOXOOOOOX....',
    '..XOOOOOOOOOX...',
    '..XOOOXOOOOOX...',
    '...XXX.XOOOOX...',
    '......XOOOOOX...',
    '.....XOOOOOOX...',
    '....XOOOOOOOX...',
    '...XOOOOOOOOX...',
    '...XOOOOOOOOX...',
    '..XOOOOOOOOOOX..',
    '..XOOOOOOOOOOX..',
    '..XXXXXXXXXXXX..',
    '................',
  ],
  b: [
    '................',
    '.......XX.......',
    '......XOOX......',
    '.....XOOOOX.....',
    '....XOOXOOOX....',
    '....XOXOOOOX....',
    '....XOOOOOOX....',
    '.....XOOOOX.....',
    '......XOOX......',
    '.....XOOOOX.....',
    '....XOOOOOOX....',
    '...XOOOOOOOOX...',
    '...XXXXXXXXXX...',
    '..XOOOOOOOOOOX..',
    '..XXXXXXXXXXXX..',
    '................',
  ],
  q: [
    '................',
    '..X...X..X...X..',
    '..OX..OX.XO..XO.',
    '..XOX.XOOX.XOX..',
    '...XOXOOOOXOX...',
    '...XOOOOOOOOX...',
    '....XOOOOOOX....',
    '....XOOOOOOX....',
    '.....XOOOOX.....',
    '....XOOOOOOX....',
    '...XOOOOOOOOX...',
    '...XOOOOOOOOX...',
    '...XXXXXXXXXX...',
    '..XOOOOOOOOOOX..',
    '..XXXXXXXXXXXX..',
    '................',
  ],
  k: [
    '.......XX.......',
    '.....XXXXXX.....',
    '.......XX.......',
    '....XXXOOXXX....',
    '...XOOOOOOOOX...',
    '..XOOOOXXOOOOX..',
    '..XOOOXXXXOOOX..',
    '..XOOOOXXOOOOX..',
    '...XOOOOOOOOX...',
    '....XOOOOOOX....',
    '....XOOOOOOX....',
    '...XOOOOOOOOX...',
    '...XXXXXXXXXX...',
    '..XOOOOOOOOOOX..',
    '..XXXXXXXXXXXX..',
    '................',
  ],
};

const PixelPieceSvg: React.FC<{
  type: PieceSymbol;
  color: PlayerColor;
  className: string;
}> = ({ type, color, className }) => {
  const isWhite = color === 'w';
  const fill = isWhite ? '#FAF9F6' : '#262422';
  const stroke = isWhite ? '#1C1917' : '#0F0E0D';
  const grid = PIXEL_GRIDS[type];

  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      {grid.map((row, y) =>
        row.split('').map((ch, x) => {
          if (ch === '.') return null;
          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="1"
              height="1"
              fill={ch === 'X' ? stroke : fill}
            />
          );
        })
      )}
    </svg>
  );
};

export const ChessPieceSvg: React.FC<ChessPieceSvgProps> = ({
  type,
  color,
  pieceSet = 'classic',
  className = 'w-full h-full',
}) => {
  if (pieceSet === 'neo') {
    return <NeoPieceSvg type={type} color={color} className={className} />;
  }
  if (pieceSet === 'pixel') {
    return <PixelPieceSvg type={type} color={color} className={className} />;
  }

  const isWhite = color === 'w';
  const fill = isWhite ? '#FAF9F6' : '#262422';
  const stroke = isWhite ? '#1C1917' : '#141210';
  const innerStroke = isWhite ? '#1C1917' : '#E7E5E4';

  switch (type) {
    case 'p':
      return (
        <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
          <path
            d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {!isWhite && (
            <path
              d="M15.5 36.5h14"
              stroke={innerStroke}
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.55"
            />
          )}
        </svg>
      );

    case 'r':
      return (
        <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
          <g
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
            <path d="M34 14l-3 3H14l-3-3" />
            <path d="M31 17v12.5H14V17" />
            <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
            <path d="M11 14h23" />
          </g>
          {!isWhite && (
            <g stroke={innerStroke} strokeWidth="1.1" strokeLinecap="round" opacity="0.7">
              <path d="M12 35.5h21" />
              <path d="M13 31.5h19" />
              <path d="M14 29.5h17" />
              <path d="M14 16.5h17" />
              <path d="M11 14h23" />
            </g>
          )}
        </svg>
      );

    case 'n':
      return (
        <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
          <g
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
            <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
          </g>
          <circle
            cx="15"
            cy="15.5"
            r="0.9"
            fill={innerStroke}
            stroke={innerStroke}
            strokeWidth="0.6"
          />
          <path
            d="M9.5 25.5a0.5 0.5 0 1 1-1 0 .5.5 0 1 1 1 0z"
            fill={innerStroke}
            stroke={innerStroke}
            strokeWidth="0.6"
          />
          {!isWhite && (
            <path
              d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34-2.37-4.49-5.79-6.64-9.19-7.16l-.51-.1z"
              fill={innerStroke}
              opacity="0.35"
            />
          )}
        </svg>
      );

    case 'b':
      return (
        <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
          <g
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" />
            <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
            <circle cx="22.5" cy="8" r="2.5" />
          </g>
          <path
            d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"
            stroke={innerStroke}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'q':
      return (
        <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
          <g
            fill={fill}
            stroke={stroke}
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="6" cy="12" r="2.6" />
            <circle cx="14" cy="9" r="2.6" />
            <circle cx="22.5" cy="8" r="2.6" />
            <circle cx="31" cy="9" r="2.6" />
            <circle cx="39" cy="12" r="2.6" />
            <path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" />
            <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
          </g>
          <path
            d="M11 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0"
            fill="none"
            stroke={innerStroke}
            strokeWidth="1.25"
            strokeLinecap="round"
            opacity={isWhite ? 0.85 : 0.75}
          />
        </svg>
      );

    case 'k':
      return (
        <svg viewBox="0 0 45 45" className={className} aria-hidden="true">
          <g
            fill="none"
            stroke={stroke}
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22.5 11.63V6" />
            <path d="M20 8h5" />
          </g>
          <g
            fill={fill}
            stroke={stroke}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
            <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" />
          </g>
          <g
            fill="none"
            stroke={innerStroke}
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity={isWhite ? 0.85 : 0.75}
          >
            <path d="M11.5 30c5.5-3 15.5-3 21 0" />
            <path d="M11.5 33.5c5.5-3 15.5-3 21 0" />
            <path d="M11.5 37c5.5-3 15.5-3 21 0" />
          </g>
        </svg>
      );
  }
};
