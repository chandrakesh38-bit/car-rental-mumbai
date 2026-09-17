
/* =========================================================
   PARTNER DOCUMENT UPLOAD ENHANCEMENT
   Preview + Change + Remove + Image Compression
   ========================================================= */

(function () {
    const DOC_MAX_MB = 5;
    const TOTAL_MAX_MB = 4;
    const PHOTO_MAX_COUNT = 4;

    const DOC_TYPES = ["image/jpeg", "image/png", "application/pdf"];
    const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

    window.docFields = [
        { id: "part-rc", label: "RC Copy" },
        { id: "part-insurance", label: "Valid Insurance" },
        { id: "part-puc", label: "PUC" },
        { id: "part-dl", label: "Driving Licence" },
        { id: "part-aadhaar", label: "Aadhaar Card" },
        { id: "part-pan", label: "PAN Card" }
    ];

    const state = {
        docs: {},
        photos: [null, null, null, null]
    };

    function formatSize(bytes) {
        if (!bytes) return "0 KB";
        if (bytes < 1024 * 1024) {
            return Math.round(bytes / 1024) + " KB";
        }
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    function showMessage(message) {
        alert(message);
    }

    function isImage(file) {
        return file && file.type.startsWith("image/");
    }

    function compressImage(file, maxWidth = 1600, quality = 0.72) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = function (e) {
                const img = new Image();

                img.onload = function () {
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round(height * maxWidth / width);
                        width = maxWidth;
                    }

                    const canvas = document.createElement("canvas");
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(
                        function (blob) {
                            if (!blob) {
                                reject(new Error("Image compression failed."));
                                return;
                            }

                            const newName =
                                file.name.replace(/\.[^/.]+$/, "") + ".jpg";

                            resolve(
                                new File([blob], newName, {
                                    type: "image/jpeg",
                                    lastModified: Date.now()
                                })
                            );
                        },
                        "image/jpeg",
                        quality
                    );
                };

                img.onerror = () =>
                    reject(new Error("Unable to read image."));
                img.src = e.target.result;
            };

            reader.onerror = () =>
                reject(new Error("Unable to read selected file."));

            reader.readAsDataURL(file);
        });
    }

    function createPreviewCard(file, container, onChange, onRemove) {
        container.innerHTML = "";

        const card = document.createElement("div");
        card.className =
            "mt-2 flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50";

        let previewHTML = "";

        if (isImage(file)) {
            const url = URL.createObjectURL(file);

            previewHTML = `
                <img
                    src="${url}"
                    class="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                    alt="Preview"
                >
            `;
        } else {
            previewHTML = `
                <div class="w-14 h-14 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                    <i class="fa-solid fa-file-pdf text-red-500 text-xl"></i>
                </div>
            `;
        }

        card.innerHTML = `
            ${previewHTML}

            <div class="min-w-0 flex-1">
                <div class="text-xs font-bold text-slate-800 truncate">
                    ${file.name}
                </div>

                <div class="text-[10px] text-slate-500 mt-0.5">
                    ${formatSize(file.size)}
                </div>

                <div class="flex gap-3 mt-1.5">
                    <button
                        type="button"
                        class="text-[10px] font-bold text-indigo-700 hover:text-indigo-900"
                        data-change
                    >
                        Change
                    </button>

                    <button
                        type="button"
                        class="text-[10px] font-bold text-red-600 hover:text-red-700"
                        data-remove
                    >
                        Remove
                    </button>
                </div>
            </div>
        `;

        card.querySelector("[data-change]").onclick = onChange;
        card.querySelector("[data-remove]").onclick = onRemove;

        container.appendChild(card);
    }

    async function processDocumentFile(file, fieldId, previewContainer) {
        if (!file) return;

        if (!DOC_TYPES.includes(file.type)) {
            showMessage(
                "Invalid file format.\n\nSupported formats: JPG, JPEG, PNG or PDF."
            );
            return;
        }

        if (file.size > DOC_MAX_MB * 1024 * 1024) {
            showMessage(
                `${file.name}\n\nFile is too large.\nMaximum allowed size is ${DOC_MAX_MB} MB.`
            );
            return;
        }

        let finalFile = file;

        try {
            if (isImage(file)) {
                finalFile = await compressImage(file, 1800, 0.78);
            }
        } catch (error) {
            console.error(error);
            showMessage("Unable to process this image. Please try again.");
            return;
        }

        state.docs[fieldId] = finalFile;

        const input = document.getElementById(fieldId);
const wrapper = input?.parentElement;
const button = wrapper?.querySelector('button');
const label = wrapper?.querySelector('label');

if (wrapper) {
    wrapper.classList.remove('partner-document-missing');
}

if (button) {
    button.classList.remove(
        'border-red-500',
        'bg-red-50',
        'ring-2',
        'ring-red-200'
    );

    button.classList.add(
        'border-slate-300',
        'bg-white'
    );
}

if (label) {
    label.classList.remove('text-red-600');
}

        createPreviewCard(
            finalFile,
            previewContainer,
            () => document.getElementById(fieldId + "-picker").click(),
            () => {
                delete state.docs[fieldId];
                previewContainer.innerHTML = "";
            }
        );
    }

    function setupDocumentField(field) {
        const input = document.getElementById(field.id);
        if (!input) return;

        input.style.display = "none";

        const wrapper = input.parentElement;

        const picker = document.createElement("input");
        picker.type = "file";
        picker.id = field.id + "-picker";
        picker.accept = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";
        picker.className = "hidden";

        const button = document.createElement("button");
        button.type = "button";
        button.className =
            "w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white hover:bg-slate-50 text-left font-semibold text-slate-700";

        button.innerHTML =
            '<i class="fa-solid fa-upload mr-2 text-indigo-600"></i> Choose File';

        const preview = document.createElement("div");

        button.onclick = () => picker.click();

        picker.onchange = async function () {
            const file = picker.files[0];

            if (!file) return;

            await processDocumentFile(
                file,
                field.id,
                preview
            );

            picker.value = "";
        };

        wrapper.insertBefore(button, input);
        wrapper.insertBefore(picker, input);
        wrapper.appendChild(preview);
    }

    function buildVehiclePhotoUI(oldInput) {
        if (!oldInput) return;

        const parent = oldInput.parentElement;

        oldInput.style.display = "none";

        const main = document.createElement("div");
        main.className = "space-y-2";

        const info = document.createElement("div");
        info.className =
            "text-[11px] text-slate-500 leading-relaxed";

        info.innerHTML = `
            <strong class="text-slate-700">Optional • Upload up to 4 clear vehicle photos</strong><br>
            Front, Right, Rear and Left • JPG, PNG or WEBP • Max 5 MB each<br>
            `;

        main.appendChild(info);

        const positions = ["Front", "Right", "Rear", "Left"];

        positions.forEach((position, index) => {
            const row = document.createElement("div");

            row.className =
                "border border-slate-200 rounded-xl p-2.5 bg-white";

            const fileInput = document.createElement("input");

            fileInput.type = "file";
            fileInput.accept =
                ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
            fileInput.className = "hidden";
            fileInput.id = `vehicle-photo-${index}`;

            const choose = document.createElement("button");

            choose.type = "button";
            choose.className =
                "w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white hover:bg-slate-50 text-left font-semibold text-slate-700";

            choose.innerHTML =
                `<i class="fa-solid fa-camera mr-2 text-indigo-600"></i>${position} Photo`;

            const preview = document.createElement("div");

            choose.onclick = () => fileInput.click();

            fileInput.onchange = async function () {
                const file = fileInput.files[0];

                if (!file) return;

                if (!PHOTO_TYPES.includes(file.type)) {
                    showMessage(
                        "Vehicle photo must be JPG, PNG or WEBP."
                    );
                    fileInput.value = "";
                    return;
                }

                if (file.size > 5 * 1024 * 1024) {
                    showMessage(
                        "Vehicle photo is too large.\nMaximum allowed size is 5 MB."
                    );
                    fileInput.value = "";
                    return;
                }

                let finalFile;

                try {
                    finalFile = await compressImage(
                        file,
                        1600,
                        0.72
                    );
                } catch (error) {
                    console.error(error);
                    showMessage(
                        "Unable to compress this image. Please try again."
                    );
                    return;
                }

                state.photos[index] = finalFile;

                createPreviewCard(
                    finalFile,
                    preview,
                    () => fileInput.click(),
                    () => {
                        state.photos[index] = null;
                        preview.innerHTML = "";
                    }
                );

                fileInput.value = "";
            };

            row.appendChild(choose);
            row.appendChild(fileInput);
            row.appendChild(preview);

            main.appendChild(row);
        });

        parent.appendChild(main);
    }

    function updateOriginalInputsBeforeSubmit() {
        /*
         * Put the compressed files back into the original inputs
         * so the existing submit function can continue using .files[0].
         */

        Object.keys(state.docs).forEach(fieldId => {
            const input = document.getElementById(fieldId);
            const file = state.docs[fieldId];

            if (!input || !file) return;

            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
        });

        const vehicleInput =
            document.getElementById("part-vehicle-photos");

        if (vehicleInput) {
            const dt = new DataTransfer();

            state.photos.forEach(file => {
                if (file) {
                    dt.items.add(file);
                }
            });

            vehicleInput.files = dt.files;
        }
    }

    function calculateTotalSize() {
        let total = 0;

        Object.values(state.docs).forEach(file => {
            if (file) total += file.size;
        });

        state.photos.forEach(file => {
            if (file) total += file.size;
        });

        return total;
    }

    window.preparePartnerFiles = function () {
        updateOriginalInputsBeforeSubmit();

        const total = calculateTotalSize();

        if (total > TOTAL_MAX_MB * 1024 * 1024) {
            showMessage(
                `Total compressed upload size is ${formatSize(total)}.\n\n` +
                `Please keep all uploaded files together under ${TOTAL_MAX_MB} MB.`
            );

            return false;
        }

        return true;
    };

    window.addEventListener("DOMContentLoaded", function () {
        docFields.forEach(setupDocumentField);

        const vehicleInput =
            document.getElementById("part-vehicle-photos");

        buildVehiclePhotoUI(vehicleInput);
    });

})();
