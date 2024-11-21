// ==UserScript==
// @name         WME EZRoad
// @namespace    https://greasyfork.org/en/scripts/518381-wme-ezroad
// @version      0.0.3
// @description  Easily update roads
// @author       https://github.com/michaelrosstarr
// @match        https://www.waze.com/*/editor*
// @grant        GM_getValue
// @grant        GM_setValue
// @icon         https://www.google.com/s2/favicons?sz=64&domain=waze.com
// @grant        none
// @license MIT
// @downloadURL https://greasyfork.org/en/scripts/518381-wme-ezroad/code/user.js
// @updateURL https://greasyfork.org/en/scripts/518381-wme-ezroad/code/user.js
// ==/UserScript==

const ScriptName = GM_info.script.name;
const ScriptVersion = GM_info.script.version;
let wmeSDK;

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
    return JSON.parse(window.localStorage.getItem('WME_EZRoads_Options') || '{roadType: 1, unpaved: false, setStreet: false, autosave: false}');
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
        wmeSDK.Events.once({ eventName: 'wme-ready' }).then(WMESpeedhelper_init());
    }
}

const WME_EZRoads_init = () => {
    log("Initing");

    const roadObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            for (let i = 0; i < mutation.addedNodes.length; i++) {
                const addedNode = mutation.addedNodes[i];

                if (addedNode.nodeType === Node.ELEMENT_NODE) {
                    // add the button here
                    // if (addedNode.querySelector('div.speed-limit-fwd') || addedNode.querySelector('div.speed-limit-rev')) {
                    //     makeSigns();
                    // }
                    let editSegment = addedNode.querySelector('#segment-edit-general');
                    if (editSegment) {
                        const quickButton = document.createElement('wz-button');
                        quickButton.setAttribute('type', 'button');
                        quickButton.setAttribute('style', 'margin-bottom: 5px, width: 100%');
                        quickButton.setAttribute('disabled', 'false');
                        quickButton.classList.add('send-button', 'ez-comment-button');
                        quickButton.textContent = 'Quick Set Road';
                        editSegment.parentNode.insertBefore(quickButton, editSegment);
                        quickButton.addEventListener('mousedown', () => handleUpdate());
                    }
                }
            }
        });
    });

    roadObserver.observe(document.getElementById('edit-panel'), { childList: true, subtree: true });

    constructSettings();

    document.addEventListener("keydown", (event) => {
        // Check if the 'U' key was pressed
        if (event.key.toLowerCase() === "u") {
            handleUpdate();
        }
    });

    log("Completed Init")
}

const handleUpdate = () => {
    const selection = wmeSDK.Editing.getSelection();

    if (!selection || selection.objectType !== 'segment') return;

    log('Updating RoadType');

    const options = getOptions();

    selection.ids.forEach(id => {

        if (options.roadType) {
            wmeSDK.DataModel.Segments.updateSegment({
                segmentId: id,
                roadType: parseInt(options.roadType)
            })
        }

        if (options.setStreet) {
            const city = getTopCity();
            console.log(city);
            const street = wmeSDK.DataModel.Streets.getStreet({
                cityId: city.id,
                streetName: '',
            });

            wmeSDK.DataModel.Segments.updateAddress({
                segmentId: id,
                primaryStreetId: street.id
            })
        }

    })

    if (options.autosave) {
        wmeSDK.Editing.save().then(() => {
            // Actions after successful save
        });
    }

}

const constructSettings = () => {

    let localOptions = getOptions();

    const update = (key, value) => {
        const options = getOptions();
        options[key] = value;
        localOptions[key] = value;
        saveOptions(options);
    }

    // -- Set up the tab for the script
    wmeSDK.Sidebar.registerScriptTab().then(({ tabLabel, tabPane }) => {
        tabLabel.innerText = 'EZRoads';
        tabLabel.title = 'Easily Update Roads';

        tabPane.innerHTML = '<div id="ezroads-settings"></div>';

        const scriptContentPane = $('#ezroads-settings');

        scriptContentPane.append(`<h2 style="margin-top: 0;">EZRoads</h2>`);
        scriptContentPane.append(`<span>Current Version: <b>${ScriptVersion}</b></span><br>`);
        scriptContentPane.append(`<span>Update Keybind: <kbd>u</kbd></span><br>`);

        scriptContentPane.append(`<h5 style="margin-top: 0;">Set Road Type</h5>`);

        const primary = $(`
            <input type="radio" id="road-ps" name="defaultRoad" ${localOptions.roadType === 2 && 'checked'}>
            <label for="road-ps">Primary Street</label><br>
        `);
        primary.on('click', () => update('roadType', 2));

        const private = $(`
            <input type="radio" id="road-private" name="defaultRoad" ${localOptions.roadType === 17 && 'checked'}>
            <label for="road-private">Private Road</label><br>
        `);
        private.on('click', () => update('roadType', 17));

        const parking = $(`
            <input type="radio" id="road-parking" name="defaultRoad" ${localOptions.roadType === 20 && 'checked'}>
            <label for="road-parking">Parking Lot Road</label><br>
        `)
        parking.on('click', () => update('roadType', 20));

        const street = $(`
            <input type="radio" id="road-street" name="defaultRoad" ${localOptions.roadType === 1 && 'checked'}>
            <label for="road-street">Street</label><br>
        `)
        street.on('click', () => update('roadType', 1));

        const offroad = $(`
            <input type="radio" id="offroad" name="defaultRoad" ${localOptions.roadType === 8 && 'checked'}>
            <label for="offroad">Set Offroad</label><br>
        `)
        offroad.on('click', () => update('roadType', 8))

        scriptContentPane.append(primary).append(private).append(parking).append(street).append(offroad);

        scriptContentPane.append(`<h5 style="margin-top: 0;">Additional Options</h5>`);

        const setStreet = $(`
            <input type="checkbox" id="setStreet" name="setStreet"  ${localOptions.setStreet && 'checked'}>
            <label for="setStreet">Set Street To None</label><br/>
        `)
        setStreet.on('click', () => update('setStreet', !localOptions.setStreet))

        scriptContentPane.append(setStreet);

        const autosave = $(`
            <input type="checkbox" id="autosave" name="autosave"  ${localOptions.autosave && 'checked'}>
            <label for="autosave">Autosave on Action</label>
        `)
        autosave.on('click', () => update('autosave', !localOptions.autosave))

        scriptContentPane.append(autosave);

    });

}
