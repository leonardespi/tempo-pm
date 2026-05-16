import { useState, useCallback, type ReactNode } from 'react';
import { TourContext } from './TourContext';
import { TOUR_STEPS } from './steps';

export function TourProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const start = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const end = useCallback(() => {
    setIsActive(false);
  }, []);

  const next = useCallback(() => {
    setCurrentStep((s) => {
      if (s >= TOUR_STEPS.length - 1) {
        setIsActive(false);
        return 0;
      }
      return s + 1;
    });
  }, []);

  const prev = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  return (
    <TourContext.Provider
      value={{ isActive, currentStep, totalSteps: TOUR_STEPS.length, start, end, next, prev }}
    >
      {children}
    </TourContext.Provider>
  );
}
