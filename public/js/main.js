if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/serviceworker.js', { scope: '/' }).then(function(reg) {
    
    if (reg.installing) {
      console.log('Service worker installing');
    } else if (reg.waiting) {
      console.log('Service worker installed');
    } else if (reg.active) {
      console.log('Service worker active');
    }
    
  }).catch(function(error) {
    // registration failed
    console.log('Registration failed with ' + error);
  });
}

var db = null;
var loggedinuserid = null;
var mediaRecorder = null;
var progress = 0;
var progressInterval = null;
var recording = false;
var dbname = 'audiomark';

function onMediaSuccess(stream) {
  mediaRecorder = new MediaStreamRecorder(stream);
  mediaRecorder.mimeType = 'audio/wav'; // check this line for audio/wav
  mediaRecorder.audioChannels = 1; // left only
  $('#micicon').removeAttr('disabled');
  mediaRecorder.ondataavailable = function (blob) {
    var e2 = $('#micicon');
    e2.removeClass('recording');
    $('#printicon').removeAttr('disabled');
    $('#doneicon').removeAttr('disabled');
    $('#micicon').attr('disabled','disabled');
    clearInterval(progressInterval);
    progressInterval = 0;
    $('#progressor').attr('style','width:100%');
    doneEncoding(blob);
  };
}

function onMediaError(e) {
  Materialize.toast('Error capturing audio', 4000);
}

function s6() { 
  return Math.floor((1 + Math.random()) * 0x100000).toString(16);
}

function doneEncoding( blob ) {
  db.post({
    _id: s6(),
    ts: new Date().getTime(),
    _attachments: {
      'audio.wav': {
        content_type: blob.type,
        data: blob
      }
    }
  }, function(err, data) {
    console.log(err, data);
    var url = location.origin + '/w/' +loggedinuserid + '/' + data.id;
    console.log('url', url);
    qrcode.clear();
    qrcode.makeCode(url);
    $('#shareurl').html('<a href="' + url + '" target="_new">' + url + '</a>');
  });
}

function toggleRecording( e ) {
  e.preventDefault();
  var e2 = $('#micicon');
  if (e2.attr('disabled')) {
    return;
  }
  if (recording && e2.hasClass('recording')) {
    console.log('stop recording');
    // stop recording
    mediaRecorder.stop();
  } else if (!recording) {
    console.log('start recording');
    recording = true;
    // start recording
    if (!mediaRecorder) {
      return Materialize.toast('Cannot record audio', 2000);
    }
    progress = 0;
    progressInterval = setInterval(function() {
      progress++;
      $('#progressor').attr('style','width:' + 100 * (progress/200) + '%');
    }, 100);
    e2.addClass('recording');
    mediaRecorder.start(20000);
  }
}

function doPrint(e) {
  e.preventDefault();
  var e2 = $('#printicon');
  if (e2.attr('disabled')) {
    return;
  }
  window.print();
}

function done(e) {
  e.preventDefault();
  var e2 = $('#doneicon');
  if (e2.attr('disabled')) {
    return;
  }
  recording = false;
  $('#printicon').attr('disabled', 'disabled');
  $('#doneicon').attr('disabled', 'disabled');
  $('#micicon').removeAttr('disabled');
  $('#shareurl').html('');
   $('#progressor').attr('style','width:0%');
}

// perform a sync
var sync = function(loggedinuser) {
  var url = window.location.origin.replace('//', '//' + loggedinuser.username + ':' + loggedinuser.meta.password + '@');
  url += '/audiomark';
  var remote = new PouchDB(url);
  console.log('syncing to', url)

  // sync live with retry, animating the icon when there's a change'
  db.replicate.to(remote, {live: true, retry: true}).on('change', function(c) {
    console.log('change', c)
  }).on('denied', function (err) {
    // a document failed to replicate (e.g. due to permissions)
    console.log('denied', err)
  }).on('complete', function (info) {
    // handle complete
  }).on('error', function (err) {
    // handle error
    console.log('error',err);
  });
}

var exchangeToken = function(token) {
  var req = {
    method: 'get',
    url: '/_token/' + token,
    dataType: 'json'
  }
  $.ajax(req).done(function(data) {
    if (data && data.ok === false) {
       return Materialize.toast('Invalid token', 10000);
    }
    delete data._rev
    data._id = '_local/user';
    console.log('saving', data);
    db.put(data).then(function(rep) {
      location.href='/';
    })
  }).fail(function(e) {
    Materialize.toast('Invalid token', 10000);
  })
}

function logout(e) {
  e.preventDefault();
  db.destroy().then(function() {
    db = new PouchDB(dbname);
    $('#navname1').html('');
    $('#navname2').html('');
    $('#loginlink').show();
    $('#navlogout1').hide();
    $('#navlogout2').hide();
  });
}

$( document ).ready(function() {
  $(".button-collapse").sideNav();
  db = new PouchDB(dbname);

  if (location.hash && location.hash.indexOf('token=') != -1) {
    $('#main').hide();
    $('#nologgedin').hide();
    var idx = location.hash.indexOf('token=');
    var h = location.hash.indexOf('#', idx) != -1 ? location.hash.indexOf('#', idx) : location.hash.length;
    var a = location.hash.indexOf('&', idx) != -1 ? location.hash.indexOf('&', idx) : location.hash.length;
    token = location.hash.substring(idx+6, Math.min(h, a));
    exchangeToken(token);
    return;
  } else {
    db.get('_local/user').then(function(data) {
      loggedinuser = data;
      loggedinuserid = data.username;
      $('#loginlink').hide();
      var msg = 'Welcome back, ' + data.meta.name ;
      $('#navname1').html(data.meta.name);
      $('#navname2').html(data.meta.name);
      $('#navlogout1').show();
      $('#navlogout2').show();
      Materialize.toast(msg, 4000);
      sync(data);
      var w = $('body').width() / 2;
      qrcode = new QRCode("qr", {
          text: "http://github.com",
          width: w,
          height: w
      });
    }).catch(function(e) {
      $('#main').hide();
      $('#navlogout1').hide();
      $('#navlogout2').hide();
    });
  }

  $('#navlogout1').click(logout);
  $('#navlogout2').click(logout);

  $('#micicon').click(toggleRecording);
  $('#printicon').click(doPrint);
  $('#doneicon').click(done);

  if (!navigator.getUserMedia) {
     navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
  }
  if(navigator.getUserMedia) {
    navigator.getUserMedia({audio: true, video:false}, onMediaSuccess, onMediaError);
  } else {
    Materialize.toast('Cannot capture audio on this web browser :(', 4000);
  }
});
