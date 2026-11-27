'use client';

interface TourOverlayProps {
  highlightRect: DOMRect | null;
  stepId: string;
}

export function TourOverlay({ highlightRect, stepId }: TourOverlayProps) {
  const showSpotlight = highlightRect && stepId !== 'welcome';

  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 bg-black/75"
        // A stray click or tap must not end the tour; Skip, close and Escape do.
        aria-hidden="true"
        style={
          showSpotlight
            ? {
                clipPath: `polygon(
                  0% 0%,
                  0% 100%,
                  ${highlightRect.left - 8}px 100%,
                  ${highlightRect.left - 8}px ${highlightRect.top - 8}px,
                  ${highlightRect.right + 8}px ${highlightRect.top - 8}px,
                  ${highlightRect.right + 8}px ${highlightRect.bottom + 8}px,
                  ${highlightRect.left - 8}px ${highlightRect.bottom + 8}px,
                  ${highlightRect.left - 8}px 100%,
                  100% 100%,
                  100% 0%
                )`,
              }
            : {}
        }
      />

      {showSpotlight && (
        <div
          className="absolute border-4 border-blue-500 rounded-lg pointer-events-none shadow-[0_0_30px_rgba(59,130,246,1),0_0_60px_rgba(59,130,246,0.5)]"
          style={{
            top: highlightRect.top - 8,
            left: highlightRect.left - 8,
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
          }}
        />
      )}
    </div>
  );
}
