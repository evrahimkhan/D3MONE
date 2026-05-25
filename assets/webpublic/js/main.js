// Read CSRF token from cookie
function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
}

// Auto-include CSRF token on all jQuery AJAX requests
$.ajaxSetup({
    beforeSend: function(xhr) {
        xhr.setRequestHeader('X-CSRF-Token', getCsrfToken());
    }
});

function sendCommand(commandID, params = {}, cb = () => { }) {
    let url = baseURL + '/' + commandID;
    console.log('[sendCommand] POST', url, params);
    $.post(url, params, function (data) {
        console.log('[sendCommand] response:', data);
        if (data.error) return cb(data.error, undefined)
        else return cb(false, data.message);
    }).fail(function(xhr, textStatus, errorThrown) {
        console.error('[sendCommand] FAIL:', xhr.status, xhr.responseText);
        cb('Request failed (' + xhr.status + ')', undefined);
    });
}

function showNotification(backgroundColor, text) {
    Snackbar.show({ text, backgroundColor, pos: 'top-right', showAction: false });
}

function updateButton(element, commandID, additionalParams = {}) {
    $(element).addClass('loading');
    sendCommand(commandID, additionalParams, (error, message) => {
        // ok, yes, i'm adding 'fake' delay, it just makes the front end nicer, okay!?
        if (error) {
            setTimeout(() => {
                showNotification('#f03434', error)
                $(element).removeClass('loading')
            }, 300)
        } else {
            setTimeout(() => {
                showNotification('#2ecc71', message);
                $(element).removeClass('loading');
                if (message === 'Requested') setTimeout(() => { window.location = window.location }, 200)
            }, 300)
        }
    });
}
