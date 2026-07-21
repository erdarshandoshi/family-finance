import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Adds hover elevation — use for clickable cards */
  interactive?: boolean;
  onClick?: () => void;
}

// Standard surface card — consistent radius, border, and elevation across the app.
export default function Card({ children, className = '', interactive, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface border border-edge rounded-2xl shadow-card ${
        interactive ? 'hover:shadow-cardhover hover:border-edge transition-all cursor-pointer' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
