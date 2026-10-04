export function Wordmark({ large = false, live = false }: { large?: boolean; live?: boolean }) {
  return (
    <span className={`wordmark${large ? ' wordmark-large' : ''}`}>
      tick
      <span className={`wordmark-dot${live ? ' is-live' : ''}`} aria-hidden="true" />
    </span>
  );
}
