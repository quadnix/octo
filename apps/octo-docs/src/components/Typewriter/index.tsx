import React, { type ReactElement, useEffect, useState } from 'react';
import styles from './styles.module.scss';

interface TypewriterOptions {
  className?: string;
  deletingSpeed?: number;
  pauseDuration?: number;

  /**
   * Punctuation to keep attached to the typed word, rendered ahead of the cursor so the cursor
   * always trails the whole phrase.
   */
  suffix?: string;
  typingSpeed?: number;
  words: string[];
}

/**
 * Types each word in turn, pauses, deletes it, and moves on to the next.
 */
export default function Typewriter({
  className,
  deletingSpeed = 50,
  pauseDuration = 2000,
  suffix = '',
  typingSpeed = 100,
  words,
}: TypewriterOptions): ReactElement {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  // Starts on the first word rather than on an empty string, so the sentence around it is complete
  // on the first paint and in the pre-rendered HTML.
  const [currentText, setCurrentText] = useState(words[0]);
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
      {currentText.length > 0 ? suffix : ''}
      <span className={styles.typewriterCursor}>|</span>
    </span>
  );
}
