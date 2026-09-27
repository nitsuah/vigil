import React, { useEffect, useRef } from 'react';

// Simple Toast component for non-disruptive notifications.
// `raised` lifts it above the sync progress panel, which shares the corner.
export const Toast = ({ message, onClose, raised = false }: { message: string; onClose: () => void; raised?: boolean }) => {
    // The timer is keyed on the message only: callers pass a fresh onClose on
    // every render, and restarting the timer on each re-render (e.g. once a
    // second while a sync polls) kept the toast on screen indefinitely.
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        const timer = setTimeout(() => onCloseRef.current(), 4000);
        return () => clearTimeout(timer);
    }, [message]);

    return (
        <div
            role="status"
            className={`fixed right-4 max-w-md bg-slate-800 text-white px-4 py-2 rounded shadow-lg z-50 transition-[bottom] duration-200 ${raised ? 'bottom-44' : 'bottom-4'}`}
        >
            {message}
        </div>
    );
};
