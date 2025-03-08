// ==UserScript==
// @name         WME EZSegments
// @namespace    https://greasyfork.org/en/scripts/518381-wme-ezsegments
// @version      0.1.9
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
let buttonCreated = false;

const defaultOptions = { roadType: 1, unpaved: false, setStreet: false, autosave: false, setSpeed: 60 };

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
        // Only proceed if we haven't created the button yet
        if (buttonCreated) {
            return;
        }

        mutations.forEach((mutation) => {
            // Exit early if button already created
            if (buttonCreated) return;

            for (let i = 0; i < mutation.addedNodes.length; i++) {
                // Exit early if button already created
                if (buttonCreated) break;

                const addedNode = mutation.addedNodes[i];

                if (addedNode.nodeType === Node.ELEMENT_NODE) {
                    let editSegment = addedNode.querySelector('#segment-edit-general');
                    if (editSegment && !buttonCreated) {
                        openPanel = editSegment;

                        // Extra check - don't proceed if button exists
                        const existingButton = document.querySelector('[data-ez-road-button="true"]');
                        if (existingButton) {
                            log("Button already exists in DOM, not creating another");
                            buttonCreated = true;
                            return;
                        }

                        // Create button with a separate function for clarity
                        createQuickSetButton(editSegment);
                    }
                }
            }
        });
    });

    // New function to create the button
    function createQuickSetButton(editSegment) {
        // Final check before creating
        if (buttonCreated || document.querySelector('[data-ez-road-button="true"]')) {
            log("Button creation prevented - already exists");
            buttonCreated = true;
            return;
        }

        log("Creating Quick Set Road button");
        const quickButton = document.createElement('wz-button');
        quickButton.setAttribute('type', 'button');
        quickButton.setAttribute('style', 'margin-bottom: 5px; width: 100%');
        quickButton.setAttribute('disabled', 'false');
        quickButton.setAttribute('data-ez-road-button', 'true');
        quickButton.setAttribute('id', 'ez-road-quick-button');
        quickButton.classList.add('send-button', 'ez-comment-button');
        quickButton.textContent = 'Quick Set Road';
        editSegment.parentNode.insertBefore(quickButton, editSegment);
        quickButton.addEventListener('mousedown', () => handleUpdate());

        // Set flag to prevent future creation
        buttonCreated = true;
        log("Button created and flag set");
    }

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

    const update = (key, value) => {
        const options = getOptions();
        options[key] = value;
        localOptions[key] = value;
        saveOptions(options);
    };

    // Reset all options to defaults
    const resetOptions = () => {
        saveOptions(defaultOptions);
        // Refresh the page to reload settings
        window.location.reload();
    };

    // Road type definitions
    const roadTypes = [
        { id: 1, name: 'Street', value: 1 },
        { id: 2, name: 'Primary Street', value: 2 },
        { id: 3, name: 'Private Road', value: 17 },
        { id: 4, name: 'Parking Lot Road', value: 20 },
        { id: 5, name: 'Offroad', value: 8 },
        { id: 6, name: 'Railroad', value: 18 }
    ];

    // Checkbox option definitions
    const checkboxOptions = [
        { id: 'setStreet', text: 'Set Street To None', key: 'setStreet' },
        { id: 'autosave', text: 'Autosave on Action', key: 'autosave' },
        { id: 'unpaved', text: 'Set Road as Unpaved', key: 'unpaved' }
    ];

    // Helper function to create radio buttons
    const createRadioButton = (roadType) => {
        const id = `road-${roadType.id}`;
        const isChecked = localOptions.roadType === roadType.value;
        const div = $(`<div class="ezroads-option">
            <input type="radio" id="${id}" name="defaultRoad" ${isChecked ? 'checked' : ''}>
            <label for="${id}">${roadType.name}</label>
        </div>`);
        div.on('click', () => update('roadType', roadType.value));
        return div;
    };

    // Helper function to create checkboxes
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
                margin-bottom: 5px;
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