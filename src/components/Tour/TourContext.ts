import { createContext } from 'react';

export interface TourContextValue {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  start: () => void;
  end: () => void;
  next: () => void;
  prev: () => void;
}

export const TourContext = createContext<TourContextValue | null>(null);
