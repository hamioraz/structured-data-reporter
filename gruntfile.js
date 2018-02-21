var WAE = require('web-auto-extractor').default;
var request = require('request');
var _ = require('underscore');
var json2csv = require('json2csv');

module.exports = function(grunt) {

    grunt.registerTask('sdr', 'Structured Data Validation.', function() {

        //TODO: Support sitemap parsing
        var filepath = grunt.option('urlSrcFile') || 'source.txt'; //Source

        var report = grunt.option('report') || 'report'; //Destination
        var values = grunt.option('values') || 'values'; //Destination
        var max = grunt.option('max') || 1000; //Upper page limit

        if (!grunt.file.exists(filepath)) {
            grunt.fail.warn('urlSrcFile ' + filepath + ' not found');
        }

        //Read source URLs from file
        var contents = grunt.file.read(filepath);
        var pageUrls = contents.split("\r\n");
        var reports = [];
        var records = [];

        var expect = function(source, field, inverse) {
            grunt.log.write(field + '...');

            if (!inverse)
                inverse = false;

            var isMissing = function() {
                if (source[field] === undefined) {
                    expect.report[field] = 'MISSING';
                    grunt.log.error('MISSING');
                    return true;
                }
                return false;
            };

            var validate = function(equal, field, error) {
                expect.count++;
                if ((equal && !inverse) || (!equal && inverse)) {
                    expect.passed++;
                    grunt.log.ok();

                    expect.report[field] = 'TRUE';

                } else {
                    if (error){
                        grunt.log.error(error);

                        expect.report[field] = error;
                    }
                    else {
                        grunt.log.error(source[field]);

                        expect.report[field] = 'FALSE';
                    }
                }
            };

            return {
                not: function() {
                    inverse = true;
                    return expect;
                },
                toBe: function(expectedValue) {
                    if (isMissing()) return;
                    var equal = source[field] && source[field] === expectedValue;
                    validate(equal, field);
                },
                toMatch: function(expectedValue) {
                    if (isMissing()) return;
                    var equal = source[field] && source[field].match(expectedValue);
                    validate(equal, field);
                },
                toBeNonEmptyString: function() {
                    if (isMissing()) return;
                    var equal = source[field] && source[field] !== '';
                    validate(equal, field, 'EMPTY');
                },
                toBeGreaterThan: function(expectedValue) {
                    if (isMissing()) return;
                    var equal = source[field] && source[field] > expectedValue;
                    validate(equal, field, expectedValue);
                }
            }
        };

        expect.report = {};
        expect.count = 0;
        expect.passed = 0;
        expect.results = function() {
            grunt.log.write('PASSED...').ok(expect.passed);
            if (expect.count === expect.passed) {
                grunt.log.write('FAILED...').ok(expect.count - expect.passed);
                grunt.log.write('TOTAL...').ok(expect.count);
            } else {
                grunt.log.write('FAILED...').error(expect.count - expect.passed);
                grunt.log.write('TOTAL...').error(expect.count);
            }
        };
        expect.reset = function() {
            expect.count = 0;
            expect.passed = 0;
            expect.report = {};
        };

        var validateUrl = function (error, response, body) {

            if (error) {
                grunt.log.error(error);
                //grunt.fail.warn(error);
                next();
                return;
            }

            grunt.log.ok();
            grunt.log.writeln();

            var wae = WAE();
            var parsed = wae.parse(body);

            if (parsed && parsed.microdata) {
                //console.log(parsed.microdata);

                if (parsed.microdata.Recipe) {
                    //console.log(parsed.microdata.Recipe);
                    //grunt.log.writeln('Extracting Recipes');

                    _.each(parsed.microdata.Recipe, function(recipe, index) {

                        grunt.log.write('Recipe: '['green']);
                        if (recipe && recipe.name) {
                            grunt.log.write(recipe.name['green']);
                        } else {
                            grunt.log.write('UNKNOWN');
                        }

                        //Only validate first recipe
                        if (index > 0) {
                            grunt.log.write('...');
                            grunt.log.writeln('SKIPPED'['yellow']);
                            return;
                        } else {
                            grunt.log.writeln();
                        }

                        expect.reset();

                        //console.log(response.request.uri.href);
                        expect.report.url = response.request.uri.href;
                        expect(recipe, '@context').toMatch(/schema.org/);
                        expect(recipe, '@type').toBe('Recipe');
                        expect(recipe, 'name').toBeNonEmptyString();
                        expect(recipe, 'description').toBeNonEmptyString();
                        expect(recipe, 'author').toBeNonEmptyString();
                        expect(recipe, 'image').toBeNonEmptyString();
                        expect(recipe, 'prepTime').toBeGreaterThan('00:00:00');
                        expect(recipe, 'cookTime').toBeGreaterThan('00:00:00');
                        expect(recipe, 'totalTime').toBeGreaterThan('00:00:00');
                        expect(recipe, 'recipeYield').toBeNonEmptyString();

                        if (recipe && recipe['recipeIngredient']) {
                            expect(recipe, 'recipeIngredient').toBeNonEmptyString();
                        } else {
                            expect(recipe, 'ingredients').toBeNonEmptyString();
                        }

                        expect(recipe, 'recipeInstructions').toBeNonEmptyString();

                        expect(recipe, 'aggregateRating').toBeNonEmptyString();
                        expect(recipe, 'nutrition').toBeNonEmptyString();
                        //expect(recipe, '').toBeNonEmptyString();

                        expect.results();

                        //console.log(expect.report);
                        records.push(recipe);
                        reports.push(expect.report);

                        grunt.verbose.writeln(recipe);
                        //console.log(recipe);
                        grunt.log.writeln();

                    });


                }
            }

            grunt.log.writeln();
            next();
            //done();
        };

        var done = this.async();

        var index = 0;

        var next = function() {
            if (pageUrls.length > 0 && index < max){
                index++;
                var pageUrl = pageUrls[0];
                pageUrls.splice(0, 1);

                grunt.log.writeln();
                grunt.log.writeln('Loading URL');
                grunt.log.writeln(pageUrl);
                grunt.log.write('URL Loaded...');

                request(pageUrl, validateUrl);
            } else {
                //console.log(reports);

                var jsonReports = JSON.stringify(reports);
                var jsonRecords = JSON.stringify(records);

                grunt.file.write(report + '.json', jsonReports);
                grunt.file.write(values + '.json', jsonRecords);

                grunt.file.write(report + '.csv', json2csv({data: reports}));
                grunt.file.write(values + '.csv', json2csv({data: records}));

                done();
            }
        };

        next();

    });


};