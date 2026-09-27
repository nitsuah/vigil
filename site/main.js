// Hero video controls, priority toggle, and copy buttons.
(() => {
    const vid = document.getElementById('hero-vid');
    const play = document.getElementById('hero-play');
    const mute = document.getElementById('hero-mute');
    const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
    ).matches;

    const syncPlay = () => {
        const paused = vid.paused;
        play.dataset.state = paused ? 'paused' : 'playing';
        play.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    };
    const syncMute = () => {
        mute.setAttribute('aria-pressed', String(!vid.muted));
        mute.setAttribute(
            'aria-label',
            vid.muted ? 'Unmute video' : 'Mute video',
        );
    };
    // play() rejects when the browser blocks playback; keep the controls
    // truthful instead of leaving an unhandled rejection.
    const tryPlay = () =>
        vid.play().catch(() => {
            vid.muted = true;
            syncMute();
            syncPlay();
        });

    vid.addEventListener('play', syncPlay);
    vid.addEventListener('pause', syncPlay);
    // No autoplay attribute: start only once we know motion is welcome.
    if (!reduceMotion) tryPlay();
    syncPlay();

    play.addEventListener('click', () =>
        vid.paused ? tryPlay() : vid.pause(),
    );
    mute.addEventListener('click', () => {
        vid.muted = !vid.muted;
        if (!vid.muted) vid.currentTime = 0;
        syncMute();
        if (!vid.muted) tryPlay();
    });

    // Real PMO grid captures: P0/P1 only, then with P2 added.
    const img = document.getElementById('pri-img');
    const views = {
        p01: ['assets/pmo-p01.webp', 'P0 and P1'],
        p012: ['assets/pmo-p012.webp', 'P0, P1 and P2'],
    };
    Object.values(views).forEach(([src]) => {
        new Image().src = src;
    });
    document.querySelectorAll('[data-pri]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const [src, label] = views[btn.dataset.pri];
            document
                .querySelectorAll('[data-pri]')
                .forEach((b) =>
                    b.setAttribute('aria-pressed', String(b === btn)),
                );
            img.src = src;
            img.alt = `Repos and open work grid showing ${label} tasks, most urgent first`;
        });
    });

    document.querySelectorAll('.copy').forEach((btn) => {
        btn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(btn.dataset.copy);
                btn.textContent = 'Copied';
            } catch {
                // Clipboard blocked (permissions / insecure context): select
                // the commands so a manual copy grabs exactly the right text.
                const code = btn.parentElement.querySelector('code');
                const range = document.createRange();
                range.selectNodeContents(code);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                btn.textContent = 'Selected: press Ctrl+C';
            }
            setTimeout(() => (btn.textContent = 'Copy'), 2400);
        });
    });
})();
