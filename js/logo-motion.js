(() => {
    const logos = document.querySelectorAll('.motion-logo');
    if (!logos.length) return;

    const replay = (logo) => {
        logo.classList.remove('is-animating');
        void logo.offsetWidth;
        logo.classList.add('is-animating');
    };

    logos.forEach((logo) => {
        replay(logo);
        logo.addEventListener('click', () => replay(logo));
    });
})();
