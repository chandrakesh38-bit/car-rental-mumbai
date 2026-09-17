
function copyApplicationId() {
    const appIdText = document.getElementById('success-application-number').textContent.trim();
    if (!appIdText) return;

    navigator.clipboard.writeText(appIdText).then(() => {
        const btnText = document.getElementById('copy-btn-text');
        const icon = document.querySelector('#success-application-id .fa-copy, #success-application-id .fa-check');
        
        if (btnText) btnText.textContent = 'Copied!';
        if (icon) {
            icon.className = 'fa-solid fa-check text-emerald-600';
        }

        setTimeout(() => {
            if (btnText) btnText.textContent = 'Copy';
            if (icon) {
                icon.className = 'fa-regular fa-copy text-indigo-600';
            }
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}
