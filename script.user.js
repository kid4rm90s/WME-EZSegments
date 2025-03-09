// ==UserScript==
// @name         WME EZSegments
// @namespace    https://greasyfork.org/en/scripts/518381-wme-ezsegments
// @version      0.1.14
// @description  Easily update roads
// @author       https://github.com/michaelrosstarr
// @include 	 /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor.*$/
// @exclude      https://www.waze.com/user/*editor/*
// @exclude      https://www.waze.com/*/user/*editor/*
// @grant        GM_getValue
// @grant        GM_setValue
// @icon         https://www.google.com/s2/favicons?sz=64&domain=waze.com
// @grant        none
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/518381/WME%20EZSegments.user.js
// @updateURL https://update.greasyfork.org/scripts/518381/WME%20EZSegments.meta.js
// ==/UserScript==

const ScriptName = GM_info.script.name;
const ScriptVersion = GM_info.script.version;
let wmeSDK;

const roadTypes = [
    { id: 1, name: 'Street', value: 1 },
    { id: 2, name: 'Primary Street', value: 2 },
    { id: 3, name: 'Freeway', value: 3 },
    { id: 4, name: 'Ramp', value: 4 },
    { id: 5, name: 'Walking Trail', value: 5 },
    { id: 6, name: 'Major Highway', value: 6 },
    { id: 7, name: 'Minor Freeway', value: 7 },
    { id: 8, name: 'Offroad', value: 8 },
    { id: 9, name: 'Walkway', value: 9 },
    { id: 10, name: 'Pedestrian Walkway', value: 10 },
    { id: 11, name: 'Ferry', value: 15 },
    { id: 12, name: 'Stairway', value: 16 },
    { id: 13, name: 'Private Road', value: 17 },
    { id: 14, name: 'Railroad', value: 18 },
    { id: 15, name: 'Runway/Taxiway', value: 19 },
    { id: 16, name: 'Parking Lot Road', value: 20 },
    { id: 17, name: 'Alley', value: 25 },
];

const defaultOptions = { roadType: 1, unpaved: false, setStreet: false, autosave: false, setSpeed: 60, setLock: false, locks: roadTypes.map(roadType => ({ id: roadType.id, lock: 1 })) };

const locks = [
    { id: 1, value: 1 },
    { id: 2, value: 2 },
    { id: 3, value: 3 },
    { id: 4, value: 4 },
    { id: 5, value: 5 },
    { id: 6, value: 6 },
]

const log = (message) => {
    if (typeof message === 'string') {
        console.log('WME_EZRoads: ' + message);
    } else {
        console.log('WME_EZRoads: ', message);
    }
}

window.SDK_INITIALIZED.then(initScript);

function initScript() {
    wmeSDK = getWmeSdk({ scriptId: "wme-ez-roads", scriptName: "EZ Roads" });
    WME_EZRoads_bootstrap();
}

const getCurrentCountry = () => {
    return wmeSDK.DataModel.Countries.getTopCountry();
}

const getTopCity = () => {
    return wmeSDK.DataModel.Cities.getTopCity();
}

const getAllCities = () => {
    return wmeSDK.DataModel.Cities.getAll();
}

const saveOptions = (options) => {
    window.localStorage.setItem('WME_EZRoads_Options', JSON.stringify(options));
}

const getOptions = () => {

    const savedOptions = JSON.parse(window.localStorage.getItem('WME_EZRoads_Options')) || {};
    // Merge saved options with defaults to ensure all expected options exist
    return { ...defaultOptions, ...savedOptions };
}

const WME_EZRoads_bootstrap = () => {
    if (
        !document.getElementById('edit-panel')
        || !wmeSDK.DataModel.Countries.getTopCountry()
    ) {
        setTimeout(WME_EZRoads_bootstrap, 250);
        return;
    }

    if (wmeSDK.State.isReady) {
        WME_EZRoads_init();
    } else {
        wmeSDK.Events.once({ eventName: 'wme-ready' }).then(WME_EZRoads_init());
    }
}

let openPanel;

const WME_EZRoads_init = () => {
    log("Initing");

    const roadObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            for (let i = 0; i < mutation.addedNodes.length; i++) {
                const addedNode = mutation.addedNodes[i];

                if (addedNode.nodeType === Node.ELEMENT_NODE) {
                    let editSegment = addedNode.querySelector('#segment-edit-general');
                    if (editSegment) {
                        openPanel = editSegment;

                        // Check if THIS SPECIFIC panel already has the button
                        const parentElement = editSegment.parentNode;
                        if (!parentElement.querySelector('[data-ez-road-button="true"]')) {
                            log("Creating Quick Set Road button for this panel");
                            const quickButton = document.createElement('wz-button');
                            quickButton.setAttribute('type', 'button');
                            quickButton.setAttribute('style', 'margin-bottom: 5px; width: 100%');
                            quickButton.setAttribute('disabled', 'false');
                            quickButton.setAttribute('data-ez-road-button', 'true');
                            quickButton.setAttribute('id', 'ez-road-quick-button-' + Date.now()); // Unique ID using timestamp
                            quickButton.classList.add('send-button', 'ez-comment-button');
                            quickButton.textContent = 'Quick Set Road';
                            parentElement.insertBefore(quickButton, editSegment);
                            quickButton.addEventListener('mousedown', () => handleUpdate());
                            log("Button created for current panel");
                        } else {
                            log("This panel already has the button, skipping creation");
                        }
                    }
                }
            }
        });
    });

    roadObserver.observe(document.getElementById('edit-panel'), { childList: true, subtree: true });

    constructSettings();

    document.addEventListener("keydown", (event) => {
        // Check if the active element is an input or textarea
        const isInputActive = document.activeElement && (
            document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA' ||
            document.activeElement.contentEditable === 'true' ||
            document.activeElement.tagName === 'WZ-AUTOCOMPLETE' ||
            document.activeElement.tagName === 'WZ-TEXTAREA'
        );

        log(document.activeElement.tagName);
        log(isInputActive);

        // Only trigger the update if the active element is not an input or textarea
        if (!isInputActive && event.key.toLowerCase() === "u") {
            handleUpdate();
        }
    });

    log("Completed Init")
}

const getEmptyStreet = () => {
}

const getEmptyCity = () => {

    return wmeSDK.DataModel.Cities.getCity({
        cityName: '',
        countryId: getCurrentCountry().id
    }) || wmeSDK.DataModel.Cities.addCity({
        cityName: '',
        countryId: getCurrentCountry().id
    });

}

const handleUpdate = () => {
    const selection = wmeSDK.Editing.getSelection();

    if (!selection || selection.objectType !== 'segment') return;

    log('Updating RoadType');

    const options = getOptions();

    selection.ids.forEach(id => {

        // Road Type
        if (options.roadType) {

            const seg = wmeSDK.DataModel.Segments.getById({ segmentId: id });

            if (seg.roadType !== options.roadType) {
                wmeSDK.DataModel.Segments.updateSegment({ segmentId: id, roadType: options.roadType });
            }
        }

        // Set lock if enabled
        if (options.setLock) {
            const selectedRoad = roadTypes.find(rt => rt.value === options.roadType);
            if (selectedRoad) {
                const lockSetting = options.locks.find(l => l.id === selectedRoad.id);
                if (lockSetting) {
                    wmeSDK.DataModel.Segments.updateSegment({
                        segmentId: id,
                        lockRank: lockSetting.lock
                    });
                }
            }
        }

        // Speed Limit
        if (options.setSpeed != -1) {
            wmeSDK.DataModel.Segments.updateSegment({
                segmentId: id,
                fwdSpeedLimit: parseInt(options.setSpeed),
                revSpeedLimit: parseInt(options.setSpeed)
            });
        }

        // Handling the street
        if (options.setStreet) {

            let city;
            let street;

            city = getTopCity() || getEmptyCity();

            street = wmeSDK.DataModel.Streets.getStreet({
                cityId: city.id,
                streetName: '',
            });

            log(`City ${city.id}`);

            if (!street) {
                street = wmeSDK.DataModel.Streets.addStreet({
                    streetName: '',
                    cityId: city.id
                });
            }

            wmeSDK.DataModel.Segments.updateAddress({
                segmentId: id,
                primaryStreetId: street.id
            })
        }

        log(options);

        // Updated unpaved handler with fallback
        if (options.unpaved) {
            // First try the new method - look for the unpaved chip using the icon class
            const unpavedIcon = openPanel.querySelector('.w-icon-unpaved-fill');
            let unpavedToggled = false;

            if (unpavedIcon) {
                // Click the parent wz-checkable-chip element
                const unpavedChip = unpavedIcon.closest('wz-checkable-chip');
                if (unpavedChip) {
                    unpavedChip.click();
                    log('Clicked unpaved chip');
                    unpavedToggled = true;
                }
            }

            // If new method failed, try the old method as fallback
            if (!unpavedToggled) {
                try {
                    const wzCheckbox = openPanel.querySelector('wz-checkbox[name="unpaved"]');
                    if (wzCheckbox) {
                        const hiddenInput = wzCheckbox.querySelector('input[type="checkbox"][name="unpaved"]');
                        if (hiddenInput) {
                            hiddenInput.click();
                            log('Clicked unpaved checkbox (fallback method)');
                            unpavedToggled = true;
                        }
                    }
                } catch (e) {
                    log('Fallback unpaved toggle method failed: ' + e);
                }
            }

            if (!unpavedToggled) {
                log('Could not toggle unpaved setting - no compatible elements found');
            }
        }

    })

    // Autosave
    if (options.autosave) {
        wmeSDK.Editing.save().then(() => { });
    }

}

const constructSettings = () => {
    const localOptions = getOptions();
    let currentRoadType = localOptions.roadType;

    const update = (key, value) => {
        const options = getOptions();
        options[key] = value;
        localOptions[key] = value;
        saveOptions(options);
    };

    // Update lock level for a specific road type
    const updateLockLevel = (roadTypeId, lockLevel) => {
        const options = getOptions();
        const lockIndex = options.locks.findIndex(l => l.id === roadTypeId);
        if (lockIndex !== -1) {
            options.locks[lockIndex].lock = parseInt(lockLevel);
            localOptions.locks = options.locks;
            saveOptions(options);
        }
    };

    // Reset all options to defaults
    const resetOptions = () => {
        saveOptions(defaultOptions);
        // Refresh the page to reload settings
        window.location.reload();
    };

    // Checkbox option definitions
    const checkboxOptions = [
        { id: 'setStreet', text: 'Set Street To None', key: 'setStreet' },
        { id: 'autosave', text: 'Autosave on Action', key: 'autosave' },
        { id: 'unpaved', text: 'Set Road as Unpaved', key: 'unpaved' },
        { id: 'setLock', text: 'Set the lock to the level', key: 'setLock' }
    ];

    // Helper function to create radio buttons
    const createRadioButton = (roadType) => {
        const id = `road-${roadType.id}`;
        const isChecked = localOptions.roadType === roadType.value;
        const lockSetting = localOptions.locks.find(l => l.id === roadType.id) || { id: roadType.id, lock: 1 };

        const div = $(`<div class="ezroads-option">
            <div class="ezroads-radio-container">
                <input type="radio" id="${id}" name="defaultRoad" ${isChecked ? 'checked' : ''}>
                <label for="${id}">${roadType.name}</label>
                <select id="lock-level-${roadType.id}" class="road-lock-level" data-road-id="${roadType.id}" ${!localOptions.setLock ? 'disabled' : ''}>
                    ${locks.map(lock => `<option value="${lock.value}" ${lockSetting.lock === lock.value ? 'selected' : ''}>Lock ${lock.value}</option>`).join('')}
                </select>
            </div>
        </div>`);

        div.find('input[type="radio"]').on('click', () => {
            update('roadType', roadType.value);
            currentRoadType = roadType.value;
        });

        div.find('select').on('change', function () {
            updateLockLevel(roadType.id, $(this).val());
        });

        return div;
    };

    // Helper function to create checkboxess';
    const createCheckbox = (option) => {
        const isChecked = localOptions[option.key];
        const div = $(`<div class="ezroads-option">
            <input type="checkbox" id="${option.id}" name="${option.id}" ${isChecked ? 'checked' : ''}>
            <label for="${option.id}">${option.text}</label>
        </div>`);
        div.on('click', () => update(option.key, $(`#${option.id}`).prop('checked')));
        return div;
    };

    // Register the script tab
    wmeSDK.Sidebar.registerScriptTab().then(({ tabLabel, tabPane }) => {
        tabLabel.innerText = 'EZRoads';
        tabLabel.title = 'Easily Update Roads';

        // Setup base styles
        const styles = $(`<style>
            #ezroads-settings h2, #ezroads-settings h5 {
                margin-top: 0;
                margin-bottom: 10px;
            }
            .ezroads-section {
                margin-bottom: 15px;
            }
            .ezroads-option {
                margin-bottom: 8px;
            }
            .ezroads-radio-container {
                display: flex;
                align-items: center;
            }
            .ezroads-radio-container label {
                flex: 1;
                margin-right: 10px;
            }
            .ezroads-radio-container select {
                width: 80px;
            }
            .ezroads-speed-input {
                margin-top: 10px;
            }
            .ezroads-speed-input label {
                display: block;
                margin-bottom: 5px;
            }
            .ezroads-speed-input input {
                width: 80px;
            }
            .ezroads-reset-button {
                margin-top: 20px;
                padding: 8px 12px;
                background-color: #f44336;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
            }
            .ezroads-reset-button:hover {
                background-color: #d32f2f;
            }
        </style>`);

        tabPane.innerHTML = '<div id="ezroads-settings"></div>';
        const scriptContentPane = $('#ezroads-settings');
        scriptContentPane.append(styles);

        // Header section
        const header = $(`<div class="ezroads-section">
            <h2>EZRoads</h2>
            <div>Current Version: <b>${ScriptVersion}</b></div>
            <div>Update Keybind: <kbd>u</kbd></div>
        </div>`);
        scriptContentPane.append(header);

        // Road type section
        const roadTypeSection = $(`<div class="ezroads-section">
            <h5>Set Road Type</h5>
            <div id="road-type-options"></div>
        </div>`);
        scriptContentPane.append(roadTypeSection);

        const roadTypeOptions = roadTypeSection.find('#road-type-options');
        roadTypes.forEach(roadType => {
            roadTypeOptions.append(createRadioButton(roadType));
        });

        // Additional options section
        const additionalSection = $(`<div class="ezroads-section">
            <h5>Additional Options</h5>
            <div id="additional-options"></div>
        </div>`);
        scriptContentPane.append(additionalSection);

        const additionalOptions = additionalSection.find('#additional-options');
        checkboxOptions.forEach(option => {
            additionalOptions.append(createCheckbox(option));
        });

        // Speed setting section
        const speedInput = $(`<div class="ezroads-section ezroads-speed-input">
            <label for="setSpeed">Value to set speed to (set to -1 to disable)</label>
            <input type="number" id="setSpeed" name="setSpeed" value="${localOptions.setSpeed}">
        </div>`);
        speedInput.find('input').on('change', function () {
            update('setSpeed', parseInt(this.value, 10));
        });
        scriptContentPane.append(speedInput);

        // Update all lock dropdowns when setLock checkbox changes
        $(document).on('click', '#setLock', function () {
            const isChecked = $(this).prop('checked');
            $('.road-lock-level').prop('disabled', !isChecked);
        });

        // Remove the separate lock levels section

        // Reset button section
        const resetButton = $(`<button class="ezroads-reset-button">Reset All Options</button>`);
        resetButton.on('click', function () {
            if (confirm('Are you sure you want to reset all options to default values?')) {
                resetOptions();
            }
        });
        scriptContentPane.append(resetButton);
    });
};