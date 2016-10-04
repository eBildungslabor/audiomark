/* Copyright 2013 Chris Wilson

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

window.AudioContext = window.AudioContext || window.webkitAudioContext;

var audioContext = new AudioContext();
var audioInput = null,
    realAudioInput = null,
    inputPoint = null,
    audioRecorder = null;
var rafID = null;
var analyserContext = null;
var canvasWidth, canvasHeight;
var recIndex = 0;
var db = null;
var loggedinuserid = null;

function saveAudio() {
    audioRecorder.exportMonoWAV( doneEncoding );
}

function gotBuffers( buffers ) {
    var canvas = document.getElementById( "wavedisplay" );
    audioRecorder.exportMonoWAV( doneEncoding );
}

function s6() { 
  return Math.floor((1 + Math.random()) * 0x100000).toString(16);
}

function doneEncoding( blob ) {
    //Recorder.setupDownload( blob, "myRecording" + ((recIndex<10)?"0":"") + recIndex + ".wav" );
    //recIndex++;
    console.log(blob);

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
      var imgurl = 'https://chart.googleapis.com/chart?cht=qr&chs=400x400&chl=' + url;
      $('#qr').attr('src', imgurl);
      $('#qrpreview').attr('src', imgurl);
      $('#shareurl').html(url);



    });
}

function toggleRecording( e ) {
    var e2 = $('#micicon');
    if (e2.hasClass('recording')) {
        console.log('stop recording');
        // stop recording
        audioRecorder.stop();
        e2.removeClass('recording');
        audioRecorder.getBuffers( gotBuffers );
        $('#printicon').removeAttr('disabled');
        $('#doneicon').removeAttr('disabled');
        $('#micicon').attr('disabled','disabled');
    } else {
      console.log('start recording');
        // start recording
        if (!audioRecorder)
            return;
        e2.addClass('recording');
        audioRecorder.clear();
        audioRecorder.record();
    }
}

function doPrint(e) {
  var e = $('#printicon');
  if (e.attr('disabled')) {
    console.log('disabled');
    return;
  }
  window.print();
}

function done(e) {
  console.log('done');
  $('#printicon').attr('disabled', 'disabled');
  $('#doneicon').attr('disabled', 'disabled');
  $('#micicon').removeAttr('disabled');
  $('#qrpreview').attr('src','');
  $('#shareurl').html('');
}

function convertToMono( input ) {
    var splitter = audioContext.createChannelSplitter(2);
    var merger = audioContext.createChannelMerger(2);

    input.connect( splitter );
    splitter.connect( merger, 0, 0 );
    splitter.connect( merger, 0, 1 );
    return merger;
}

function cancelAnalyserUpdates() {
    window.cancelAnimationFrame( rafID );
    rafID = null;
}

function updateAnalysers(time) {
    if (!analyserContext) {
        var canvas = document.getElementById("analyser");
        canvasWidth = canvas.width;
        canvasHeight = canvas.height;
        analyserContext = canvas.getContext('2d');
    }

    // analyzer draw code here
    {
        var SPACING = 12;
        var BAR_WIDTH = 3;
        var numBars = Math.round(canvasWidth / SPACING);
        var freqByteData = new Uint8Array(analyserNode.frequencyBinCount);

        analyserNode.getByteFrequencyData(freqByteData); 

        analyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
        analyserContext.fillStyle = '#039be5';
        analyserContext.lineCap = 'round';
        var multiplier = analyserNode.frequencyBinCount / numBars;

        // Draw rectangle for each frequency bin.
        for (var i = 0; i < numBars; ++i) {
            var magnitude = 0;
            var offset = Math.floor( i * multiplier );
            // gotta sum/average the block, or we miss narrow-bandwidth spikes
            for (var j = 0; j< multiplier; j++)
                magnitude += freqByteData[offset + j];
            magnitude = magnitude / multiplier;
            var magnitude2 = freqByteData[i * multiplier];
            //analyserContext.fillStyle = "hsl( " + Math.round((i*360)/numBars) + ", 100%, 50%)";
            analyserContext.fillRect(i * SPACING, canvasHeight, BAR_WIDTH, -magnitude);
        }
    }
    
    rafID = window.requestAnimationFrame( updateAnalysers );
}

function gotStream(stream) {
    inputPoint = audioContext.createGain();

    // Create an AudioNode from the stream.
    realAudioInput = audioContext.createMediaStreamSource(stream);
    audioInput = realAudioInput;
    audioInput.connect(inputPoint);

//    audioInput = convertToMono( input );

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    inputPoint.connect( analyserNode );

    audioRecorder = new Recorder( inputPoint );

    zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0.0;
    inputPoint.connect( zeroGain );
    zeroGain.connect( audioContext.destination );
    updateAnalysers();
}

function initAudio() {
        if (!navigator.getUserMedia)
            navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        if (!navigator.cancelAnimationFrame)
            navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
        if (!navigator.requestAnimationFrame)
            navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;

    navigator.getUserMedia(
        {
            "audio": {
                "mandatory": {
                    "googEchoCancellation": "false",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": []
            },
        }, gotStream, function(e) {
            alert('Error getting audio');
            console.log(e);
        });
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

window.addEventListener('load', function() {
  var dbname = 'audiomark';
  db = new PouchDB(dbname);

  var cc = $('#canvascontainer');
  var a = document.getElementById('analyser');
  a.width = '' + cc.innerWidth();
  a.height = '' + cc.innerHeight();

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
      $('#nologgedin').hide();
      $('#main').show();
      var msg = 'Welcome back, ' + data.meta.name ;
      $('#navname').html(data.meta.name+' &nbsp;');
      $('#navlogin').hide();
      Materialize.toast(msg, 4000);
      sync(data);
    }).catch(function(e) {
    });
  }

  initAudio();


});

// http://localhost:8000/w/10154548735446449/1d8d08