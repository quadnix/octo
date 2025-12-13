import React, { type ReactElement, useEffect, useState } from 'react';
import styles from './styles.module.scss';

interface TypewriterOptions {
  className?: string;
  deletingSpeed?: number;
  pauseDuration?: number;
  typingSpeed?: number;
  words: string[];
}

export default function Typewriter({
  className,
  deletingSpeed = 50,
  pauseDuration = 2000,
  typingSpeed = 100,
  words,
}: TypewriterOptions): ReactElement {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [speed, setSpeed] = useState(typingSpeed);

  useEffect(() => {
    const currentWord = words[currentWordIndex];

    if (!isDeleting && currentText === currentWord) {
      // Word is complete, wait then start deleting.
      const timeout = setTimeout(() => {
        setIsDeleting(true);
        setSpeed(deletingSpeed);
      }, pauseDuration);
      return (): void => clearTimeout(timeout);
    }

    if (isDeleting && currentText === '') {
      // Word is deleted, move to next word.
      setIsDeleting(false);
      setCurrentWordIndex((prev) => (prev + 1) % words.length);
      setSpeed(typingSpeed);
      return;
    }

    // Typing or deleting.
    const timeout = setTimeout(() => {
      if (isDeleting) {
        setCurrentText(currentWord.substring(0, currentText.length - 1));
      } else {
        setCurrentText(currentWord.substring(0, currentText.length + 1));
      }
    }, speed);

    return (): void => clearTimeout(timeout);
  }, [currentText, isDeleting, currentWordIndex, speed, words, typingSpeed, deletingSpeed, pauseDuration]);

  return (
    <span className={className}>
      {currentText}
      <span className={styles.typewriterCursor}>|</span>
    </span>
  );
}
