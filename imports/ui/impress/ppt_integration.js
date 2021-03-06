import { senseConfig } from '/imports/api/config.js';
import lodash from 'lodash';
import hljs from 'highlight.js';
_ = lodash;
var Cookies = require('js-cookie');
var showdown = require('showdown');
var converter = new showdown.Converter();
const enigma = require('enigma.js');
// The QIX schema needed by enigma.js
const qixschema = senseConfig.QIXSchema;

var appId = Meteor.settings.public.IntegrationPresentationApp;
var IntegrationPresentationSelectionSheet = Meteor.settings.public.IntegrationPresentationSelectionSheet; //'DYTpxv'; selection sheet of the slide generator
var IntegrationPresentationSortedDataObject = Meteor.settings.public.IntegrationPresentationSortedDataObject; //'pskL';//a table object in the saas presentation qvf, that ensures the slides are in the correct load order. better would be to load this in this order in the API call.
var slideWidth = 2000;


Template.ppt_integration.onRendered(function() {
    initializePresentation();
})

function initializePresentation() {
    Session.set('slideLoading', true);
    getLevel1to3('integrationTopics');
    getLevel1And2();
    appChangeListener();

    $('#impress').on('impress:stepenter', function() {
        $('.slideContent').css({ "visibility": "visible" });
        var step = $(this);

        //ensure we only show the content of the current step via IF condition in the template (only show content if slideNr = currentSlide)
        var activeStep = $(this).find('.active.step').attr('id');
        //convert the id value step-2 to 2
        var activeStepNr = activeStep.substr(activeStep.indexOf("-") + 1);
        Session.set('activeStepNr', activeStepNr);
    });

}
Template.ppt_integration.onDestroyed(function() {
    Cookies.set('showSlideSorter', 'false');
})

Template.integrationSlideContent.onRendered(function() {

    //init the youtube videos via semanticUI
    this.$('.ui.embed').embed();

    this.$('.markdownItem, .videoPlaceholder').transition({
        animation: 'fade in',
        duration: '3s',
    });

    this.$('img').transition({
        animation: 'fade in',
        duration: '3s',
    });

    this.$('blockquote').transition({
        animation: 'fade in',
        duration: '5s',
    });

    //make sure all code gets highlighted using highlight.js
    this.$('pre code').each(function(i, block) {
        hljs.highlightBlock(block);
    });

    //ensure all links open on a new tab
    this.$('a[href^="http://"], a[href^="https://"]').attr('target', '_blank');

})


Template.ppt_integration.helpers({
    mainTopics() {
        return Session.get('mainTopics'); //only the level 1 and 2 colums, we need this for the headers of the slide
    },
    // topics() {
    //     return Session.get('integrationTopics'); //all level 1 2 and 3 data, we need level 3 for the bullets/images of the slide
    // },
    chapterSlide(currentRow) {
        if (typeof(currentRow) === 'string') { //we got a chapter slide
            // console.log('we found a chapter slide', currentRow);
            return true
        }
    },
    XValue(index) {
        return setXValue(index);
    },
    loading() {
        return Session.get('slideLoading');
    },
    thankYouXvalue() {
        return Session.get('currentSlideNumber') * slideWidth;
    }
});

Template.integrationSlide.helpers({
    level(level, slide) {
        return textOfLevel(slide, level);
    },
    XValue(index) {
        Session.set('currentSlideNumber', index);
        return slideWidth * index;
        // return setXValue(index);
    },
    slideActive(slideNr) {
        //active slide gets set via impress.js, that fires an event. see ppt_integration.onRendered
        //for performance reasons we only do all our formatting etc when the slide is active.
        //but for the slide sorter we need all content to be loaded in one go...
        var showSlideSorter = Cookies.get('showSlideSorter');
        return (Session.get('activeStepNr') >= slideNr + 1) || Cookies.get('showSlideSorter') === 'true';
    },
    step() {
        return Session.get('activeStepNr');
    }
})

Template.integrationSlideContent.helpers({
    itemsOfLevel: function(level, slide) { //get all child items of a specific level, normally you will insert level 3 
        var parents = slide[level - 3].qText + slide[level - 2].qText; //get the names of the parents of the current slide (level 1 and 2)
        if (parents) {
            // console.log('Parent is not empty:', parents);
            return getLocalValuesOfLevel(parents); //using the parent, get all items that have this name as parent
        }
    },
    formatted(text) {
        if (youtube_parser(text)) { //youtube video url
            // console.log('found an youtube link so embed with the formatting of semantic ui', text)
            var videoId = youtube_parser(text);
            var html = '<div class="ui container videoPlaceholder"><div class="ui embed" data-source="youtube" data-id="' + videoId + '" data-icon="video" data-placeholder="images/youtube.jpg"></div></div>'
                // console.log('generated video link: ', html);
            return html;
        } else if (text.startsWith('<')) { //custom HTML
            return text;
        } else if (checkTextIsImage(text)) { //image
            // console.log('found an image', text)
            return '<img class="ui huge centered integration image"  src="images/' + text + '">'
        } else { //text, convert the text (which can include markdown syntax) to valid HTML
            var result = converter.makeHtml(text);
            if (result.substring(1, 11) === 'blockquote') {
                return '<div class="ui green very padded segment">' + result + '</div>';
            } else {
                return '<div class="markdownItem">' + result + '</div>';
            }
        }
    }
})


function setXValue(index) {
    Session.set('currentSlideNumber', index);
    return slideWidth * index;
}

function textOfLevel(row, level) {
    level -= 1
    return row[level].qText
}

function getLevel1and2Names(slide) {
    return slide[0].qText + '-' + slide[1].qText;
}

function checkTextIsImage(text) {
    return (text.match(/\.(jpeg|jpg|gif|png)$/) != null);
}

function youtube_parser(url) {
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
    var match = url.match(regExp);
    // console.log('de url '+ url + ' is een match met youtube? '+ (match && match[7].length == 11));
    return (match && match[7].length == 11) ? match[7] : false;
}

var setCurrentSlideEventHelper = function() {
    $(document).on('impress:stepenter', function(e) {
        var currentSlide = $(e.target).attr('id');
        Session.set('currentSlide', currentSlide);
    });
}

var getLocalValuesOfLevel = function(parentText) {
    // console.log('get all level 3 for level 2 with text:', parentText);
    var result = [];
    var topics = Session.get('integrationTopics'); //the level 1 and 2 values
    var level3Data = _.filter(topics, function(row) {
            var parents = row[0].qText + row[1].qText;
            if (parents === parentText) { //if the current level 1 and 2 combination matches 
                if (row[2].qText) { result.push(row[2].qText) } //add the level 3 value to the new level3Data array
            }
        })
        // console.log('level3Data:', result);
    return result;
}

function getLevel1And2() {

    // Set up connection to QIX, see https://github.com/mindspank/enigma-table-rows-example/blob/master/index.js

    enigma.getService('qix', {
            schema: qixschema,
            appId: appId,
            session: { //https://github.com/qlik-oss/enigma.js/blob/master/docs/qix/configuration.md#example-using-nodejs
                host: senseConfig.host,
                prefix: Meteor.settings.public.IntegrationPresentationProxy,
                port: senseConfig.port,
                unsecure: true
            }
        })
        .then(qix => {
            qix.app.getObject(IntegrationPresentationSortedDataObject) //get an existing object out of an app, if you import an app this stays the same
                .then(model => {
                    model.getHyperCubeData('/qHyperCubeDef', [{ qTop: 0, qLeft: 0, qWidth: 3, qHeight: 1000 }]).then(data => {
                        // console.log('Result set from Qlik Sense:', data);
                        var table = data[0].qMatrix;
                        var tableWithChapters = insertSectionBreakers(table);
                        console.log('Received a table of data via the Engine API, now the slides can be created by impress.js', tableWithChapters);
                        Session.set('mainTopics', tableWithChapters)
                        Meteor.setTimeout(function() {
                            if (Cookies.get('showSlideSorter') !== 'true') { //do not initialize impress so we can use the mobile device layout of impress to get all the slide under each other
                                impress().init();
                                impress().goto(0);
                            }
                            $('.slideContent').css({ "visibility": "hidden" }); //prevent an issue when impress has qlik sense embedded via iframes...
                            Session.set('slideLoading', false);
                        }, 100);
                    })
                })
        })
}


var appChangeListener = function appChangeListener() {
    enigma.getService('qix', {
            schema: qixschema,
            appId: appId,
            session: { //https://github.com/qlik-oss/enigma.js/blob/master/docs/qix/configuration.md#example-using-nodejs
                host: senseConfig.host,
                prefix: Meteor.settings.public.IntegrationPresentationProxy,
                port: senseConfig.port,
                unsecure: true
            }
        })
        .then(qix => {
            qix.app.on('changed', () => {
                // console.log('QIX instance change event received, so get the new data set out of Qlik Sense');
                location.reload(); //reload the browser
            });
        })
}

function getValuesOfLevel(level) {
    console.log('getLocalValuesOfLevel: ', level);

    enigma.getService('qix', {
            schema: qixschema,
            appId: appId,
            session: { //https://github.com/qlik-oss/enigma.js/blob/master/docs/qix/configuration.md#example-using-nodejs
                host: senseConfig.host,
                prefix: 'anon',
                port: senseConfig.port,
                unsecure: true
            }
        })
        .then(qix => {

            qix.app.createSessionObject({
                    qInfo: { qType: 'cube' },
                    qHyperCubeDef: {
                        qDimensions: [{
                            qDef: { qFieldDefs: [level] }
                        }]
                    }
                })
                .then(model => {
                    model.getHyperCubeData('/qHyperCubeDef', [{ qTop: 0, qLeft: 0, qWidth: 3, qHeight: 3333 }]).then(data => {
                        // console.log('Result set from Qlik Sense:', data);
                        var table = data[0].qMatrix;
                        // console.log('Level ' + level + ' data:', table);
                        Session.set('level3Data', table)
                    })
                })
        })
}

function getLevel1to3(sessionName) {
    enigma.getService('qix', {
            schema: qixschema,
            appId: appId,
            session: { //https://github.com/qlik-oss/enigma.js/blob/master/docs/qix/configuration.md#example-using-nodejs
                host: senseConfig.host,
                prefix: Meteor.settings.public.IntegrationPresentationProxy,
                port: senseConfig.port,
                unsecure: true
            }
        })
        .then(qix => {

            qix.app.createSessionObject({
                    qInfo: { qType: 'cube' },
                    qHyperCubeDef: {
                        qDimensions: [{
                            qDef: { qFieldDefs: ['Level 1'] }
                        }, {
                            qDef: { qFieldDefs: ['Level 2'] }
                        }, {
                            qDef: { qFieldDefs: ['Level 3'] }
                        }]
                    }
                })
                .then(model => {
                    model.getHyperCubeData('/qHyperCubeDef', [{ qTop: 0, qLeft: 0, qWidth: 3, qHeight: 3333 }]).then(data => {
                        // console.log('Result set from Qlik Sense:', data);
                        var table = data[0].qMatrix;
                        var tableWithChapters = insertSectionBreakers(table);
                        // console.log('New data received, chapters added and now stored in in session var ', sessionName);
                        Session.set(sessionName, tableWithChapters);
                    })
                })

        })
}

function insertSectionBreakers(table) {
    var currentLevel1, previousLevel1 = '';
    var newTableWithChapter = [];

    table.forEach(function(currentRow) {
        var currentLevel1 = textOfLevel(currentRow, 1);
        if (previousLevel1 !== currentLevel1) {
            newTableWithChapter.push(currentLevel1)
            previousLevel1 = currentLevel1;
        }
        newTableWithChapter.push(currentRow);
    });
    // console.log('table with chapters is', newTableWithChapter);
    return newTableWithChapter;
}



/**
 * Auto-indent overflowing lines
 * @author Rob W http://stackoverflow.com/u/938089
 * @param code_elem HTMLCodeElement (or any element containing *plain text*)
 */
// function autoindent(code_elem) {
//     // Grab the lines
//     var textContent = document.textContent === null ? 'textContent' : 'innerText';
//     var lines = code_elem[textContent].split(/\r?\n/),
//         fragment = document.createDocumentFragment(),
//         dummy, space_width, i, prefix_len, line_elem;

//     // Calculate the width of white space
//     // Assume that inline element inherit styles from parent (<code>)
//     dummy = document.createElement('span');
//     code_elem.appendChild(dummy);
//     // offsetWidth includes padding and border, explicitly override the style:
//     dummy.style.cssText = 'border:0;padding:0;';
//     dummy[textContent] = '          ';
//     space_width = dummy.offsetWidth / 10;
//     // Wipe contents
//     code_elem.innerHTML = '';

//     for (i = 0; i < lines.length; i++) {
//         // NOTE: All preceeding white space (including tabs is included)
//         prefix_len = /^\s*/.exec(lines[i])[0].length;
//         line_elem = fragment.appendChild(document.createElement('div'));
//         line_elem.style.marginLeft = space_width * prefix_len + 'px';
//         line_elem[textContent] = lines[i].substring(prefix_len);
//     }
//     code_elem.appendChild(fragment);
// }
