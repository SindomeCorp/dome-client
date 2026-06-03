/* eslint-disable */
 /* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */
import ace from "ace-builds/src-noconflict/ace.js";

ace.config.setModuleUrl("ace/mode/moo", import.meta.url);


ace.define('ace/mode/moo', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/text', 'ace/tokenizer', 'ace/mode/moo_highlight_rules', 'ace/range'], function(require, exports, module) {


var oop = require("../lib/oop");
var TextMode = require("./text").Mode;
var Tokenizer = require("../tokenizer").Tokenizer;
var MOOHighlightRules = require("./moo_highlight_rules").MOOHighlightRules;
var Range = require("../range").Range;

var Mode = function() {
    this.$tokenizer = new Tokenizer(new MOOHighlightRules().getRules());
};
oop.inherits(Mode, TextMode);

(function() {


    this.toggleCommentLines = function(state, doc, startRow, endRow) {
        var outdent = true;
        var re = /^(\s*)\/\//;

        for (var i=startRow; i<= endRow; i++) {
            if (!re.test(doc.getLine(i))) {
                outdent = false;
                break;
            }
        }

        if (outdent) {
            var deleteRange = new Range(0, 0, 0, 0);
            for (var i=startRow; i<= endRow; i++)
            {
                var line = doc.getLine(i);
                var m = line.match(re);
                deleteRange.start.row = i;
                deleteRange.end.row = i;
                deleteRange.end.column = m[0].length;
                doc.replace(deleteRange, m[1]);
            }
        }
        else {
            doc.indentRows(startRow, endRow, "//");
        }
    };

    this.getNextLineIndent = function(state, line, tab) {
        var indent = this.$getIndent(line);

        var tokenizedLine = this.$tokenizer.getLineTokens(line, state);
        var tokens = tokenizedLine.tokens;
        var endState = tokenizedLine.state;

        if (tokens.length && tokens[tokens.length-1].type == "comment") {
            return indent;
        }
        
        if (state == "start") {
            var match = line.match(/^\s*(?:if|elseif|else|for|while|try|except|finally|fork)\b/);
            if (match) {
                indent += tab;
            }
        } else if (state == "doc-start") {
            if (endState == "start") {
                return "";
            }
            var match = line.match(/^\s*(\/?)\*/);
            if (match) {
                if (match[1]) {
                    indent += " ";
                }
                indent += "* ";
            }
        }

        return indent;
    };

    this.checkOutdent = function(state, line, input) {
        return /^\s*(?:endif|endfor|endwhile|endtry|endfork|elseif|else|except|finally)\b/.test(line + input);
    };

    this.autoOutdent = function(state, doc, row) {
        var line = doc.getLine(row);
        var match = line.match(/^(\s*)(endif|endfor|endwhile|endtry|endfork|elseif|else|except|finally)\b/);
        if (!match) return;

        var indent = this.$findBlockIndent(doc, row, match[2]);
        if (indent == null) return;

        doc.replace(new Range(row, 0, row, match[1].length), indent);
    };

    this.$findBlockIndent = function(doc, row, keyword) {
        var openers = {
            endif: /^(?:if|elseif|else)\b/,
            elseif: /^(?:if|elseif)\b/,
            else: /^(?:if|elseif)\b/,
            endfor: /^for\b/,
            endwhile: /^while\b/,
            endtry: /^(?:try|except|finally)\b/,
            except: /^try\b/,
            finally: /^(?:try|except)\b/,
            endfork: /^fork\b/
        };
        var closers = /^(?:endif|endfor|endwhile|endtry|endfork)\b/;
        var opener = openers[keyword];
        var depth = 0;

        for (var i = row - 1; i >= 0; i--) {
            var candidate = doc.getLine(i);
            if (candidate == null) continue;

            var trimmed = candidate.trim();
            if (!trimmed || /^\/\//.test(trimmed)) continue;

            if (closers.test(trimmed)) {
                depth++;
                continue;
            }

            if (/^(?:if|for|while|try|fork)\b/.test(trimmed)) {
                if (depth == 0 && opener.test(trimmed)) {
                    return this.$getIndent(candidate);
                }
                depth--;
                continue;
            }

            if (depth == 0 && opener.test(trimmed)) {
                return this.$getIndent(candidate);
            }
        }

        return "";
    };
    
    this.createWorker = function() {
        return null;
    };

}).call(Mode.prototype);

exports.Mode = Mode;
});

ace.define('ace/mode/moo_highlight_rules', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/doc_comment_highlight_rules', 'ace/mode/text_highlight_rules'], function(require, exports, module) {


var oop = require("../lib/oop");
var DocCommentHighlightRules = require("./doc_comment_highlight_rules").DocCommentHighlightRules;
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var MOOHighlightRules = function() {
  var keywordMapper = this.createKeywordMapper({
      "variable.language":
          "player|this|caller|verb|args|argstr|dobj|dobjstr|prepstr|iobj|iobjstr",                                            
      "keyword":
          "endif|elseif|endfor|endwhile|endtry|endfork|break|except|catch|continue|else|finally|fork|for|" +
          "if|in|return|raise|try|while",
      "constant.language":
          "INT|FLOAT|OBJ|STR|LIST|ERR|NUM|MAP|WAIF|ANON|BOOL|ANY|NONE",
      "constant.language.error":
          "E_NONE|E_TYPE|E_DIV|E_PERM|E_PROPNF|E_VERBNF|E_VARNF|E_INVIND|E_RECMOVE|E_MAXREC|" +
          "E_RANGE|E_ARGS|E_NACC|E_INVARG|E_QUOTA|E_FLOAT|E_FILE|E_EXEC|E_INTRPT",
      "support.function":
          "is_member|disassemble|log_cache_stats|verb_cache_stats|call_function|raise|suspend|yin|" +
          "read|read_http|seconds_left|ticks_left|pass|set_task_perms|task_perms|caller_perms|" +
          "callers|task_stack|function_info|load_server_options|value_bytes|decode_binary|" +
          "encode_binary|chr|length|setadd|setremove|listappend|listinsert|listdelete|listset|" +
          "equal|explode|reverse|slice|sort|all_members|tostr|toliteral|match|rmatch|substitute|" +
          "index|rindex|strcmp|strsub|strtr|parse_ansi|remove_ansi|server_log|mapdelete|mapkeys|" +
          "mapvalues|maphaskey|toint|tofloat|min|max|abs|random|reseed_random|frandom|round|" +
          "random_bytes|time|ctime|ftime|floatstr|sqrt|cbrt|sin|cos|tan|asin|acos|atan|sinh|" +
          "cosh|tanh|acosh|atanh|asinh|atan2|exp|log|log10|ceil|floor|trunc|distance|" +
          "relative_heading|toobj|typeof|create|recreate|recycle|object_bytes|valid|chparents|" +
          "chparent|parents|parent|children|ancestors|descendants|max_object|players|is_player|" +
          "set_player_flag|move|isa|locate_by_name|occupants|locations|recycled_objects|" +
          "next_recycled_object|owned_objects|properties|property_info|set_property_info|" +
          "add_property|delete_property|clear_property|is_clear_property|server_version|renumber|" +
          "reset_max_object|memory_usage|usage|panic|shutdown|dump_database|db_disk_size|" +
          "open_network_connection|connected_players|connected_seconds|idle_seconds|" +
          "connection_name|notify|boot_player|set_connection_option|connection_options|" +
          "connection_info|connection_name_lookup|listen|unlisten|listeners|buffered_output_length|" +
          "task_id|queued_tasks|finished_tasks|kill_task|output_delimiters|queue_info|resume|" +
          "force_input|flush_input|set_task_local|task_local|switch_player|set_thread_mode|verbs|" +
          "verb_info|set_verb_info|verb_args|set_verb_args|add_verb|delete_verb|verb_code|" +
          "set_verb_code|respond_to|eval|parse_json|generate_json|xml_parse_tree|" +
          "xml_parse_document|encode_base64|decode_base64|file_handles|file_open|file_close|" +
          "file_name|file_openmode|file_readline|file_readlines|file_writeline|file_grep|" +
          "file_read|file_write|file_flush|file_seek|file_tell|file_eof|file_count_lines|" +
          "file_list|file_mkdir|file_rmdir|file_remove|file_rename|file_chmod|file_size|" +
          "file_mode|file_type|file_last_access|file_last_modify|file_last_change|file_stat|" +
          "getenv|exec|salt|crypt|string_hash|binary_hash|value_hash|string_hmac|binary_hmac|" +
          "value_hmac|pcre_match|pcre_replace|pcre_cache_stats|threads|thread_pool|new_waif|" +
          "waif_stats|waifs|simplex_noise|argon2|argon2_verify|spellcheck|curl|url_encode|" +
          "url_decode|sql_query|sql_connections|sql_open|sql_close|sql_info"
  }, "identifier");
  
    var identifierRe = "[a-zA-Z\\$_\u00a1-\uffff][a-zA-Z\\d\\$_\u00a1-\uffff]*\\b";
    var propertyAccessRe = "\\s*\\.";
    var verbCallAccessRe = "\\s*:\\s*" + identifierRe + "\\s*\\(";

    var escapedRe = "\\\\(?:x[0-9a-fA-F]{2}|" + // hex
        "u[0-9a-fA-F]{4}|" + // unicode
        "[0-2][0-7]{0,2}|" + // oct
        "3[0-6][0-7]?|" + // oct
        "37[0-7]?|" + // oct
        "[4-7][0-7]?|" + //oct
        ".)";

    this.$rules = {
        "start" : [
            {
                token : "comment",
                regex : /^\".*\"\;$/
            }, {
                token: "comment",
                regex: /^#!.*$/
            },
            DocCommentHighlightRules.getStartRule("doc-start"),
            {
                token : "comment", // multi line comment
                merge : true,
                regex : /\/\*/,
                next : "comment"
            }, {
                token : "comment",
                regex : /\/\/.*$/
            }, {
                token : "string",
                regex : "'(?=.)",
                next  : "qstring"
            }, {
                token : "string",
                regex : '"(?=.)',
                next  : "qqstring"
            }, {
                token : "variable.other.object.receiver.moo",
                regex : "\\$" + identifierRe + "(?=(?:" + propertyAccessRe + "|" + verbCallAccessRe + "))"
            }, {
                token : "variable.other.object.receiver.moo",
                regex : "#-?\\d+\\b(?=(?:" + propertyAccessRe + "|" + verbCallAccessRe + "))"
            }, {
                token : "variable.other.object.receiver.moo",
                regex : identifierRe + "(?=(?:" + propertyAccessRe + "|" + verbCallAccessRe + "))"
            }, {
                token : "entity.name.function.moo",
                regex : "\\$" + identifierRe + "(?=\\s*\\()"
            }, {
                token : "constant.language.core",
                regex : "\\$" + identifierRe
            }, {
                token : ["punctuation.operator", "entity.name.function.moo"],
                regex : "(:\\s*)(" + identifierRe + ")(?=\\s*\\()"
            }, {
                token : "constant.language.object",
                regex : /#-?\d+\b/
            }, {
                token : "constant.numeric", // hex
                regex : /0[xX][0-9a-fA-F]+\b/
            }, {
                token : "constant.numeric", // float
                regex : /[+-]?\d+(?:(?:\.\d*)?(?:[eE][+-]?\d+)?)?\b/
            }, {
                token : "constant.language.boolean",
                regex : /(?:true|false|TRUE|FALSE)\b/
            }, {
                token : keywordMapper,
                regex : identifierRe
            }, {
                token : "keyword.operator",
                regex : /->|\.\.|&\.|&&|\|\||==|!=|<=|>=|<>|\+=|\-=|\*=|\/=|%=|[!$%&*\/+\-~<>=^@]/
            }, {
                token : ["punctuation.operator", "variable.other.property.moo"],
                regex : "(\\.\\s*)(" + identifierRe + ")"
            }, {
                token : "punctuation.operator",
                regex : /\?|\:|\||\,|\;|\./
            }, {
                token : "paren.lparen",
                regex : /[\[({]/
            }, {
                token : "paren.rparen",
                regex : /[\])}]/
            }, {
                token : "text",
                regex : /\s+/
            }
        ],
        "comment" : [
            {
                token : "comment", // closing comment
                regex : ".*?\\*\\/",
                merge : true,
                next : "start"
            }, {
                token : "comment", // comment spanning whole line
                merge : true,
                regex : ".+"
            }
        ],
        "qqstring" : [
            {
                token : "constant.language.escape",
                regex : escapedRe
            }, {
                token : "string",
                regex : '[^"\\\\]+',
                merge : true
            }, {
                token : "string",
                regex : "\\\\$",
                next  : "qqstring",
                merge : true
            }, {
                token : "string",
                regex : '"|$',
                next  : "start",
                merge : true
            }
        ],
        "qstring" : [
            {
                token : "constant.language.escape",
                regex : escapedRe
            }, {
                token : "string",
                regex : "[^'\\\\]+",
                merge : true
            }, {
                token : "string",
                regex : "\\\\$",
                next  : "qstring",
                merge : true
            }, {
                token : "string",
                regex : "'|$",
                next  : "start",
                merge : true
            }
        ]
    };

    this.embedRules(DocCommentHighlightRules, "doc-",
        [ DocCommentHighlightRules.getEndRule("start") ]);
};

oop.inherits(MOOHighlightRules, TextHighlightRules);

exports.MOOHighlightRules = MOOHighlightRules;
});

ace.define('ace/mode/doc_comment_highlight_rules', ['require', 'exports', 'module' , 'ace/lib/oop', 'ace/mode/text_highlight_rules'], function(require, exports, module) {


var oop = require("../lib/oop");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

var DocCommentHighlightRules = function() {

    this.$rules = {
        "start" : [ {
            token : "comment.doc.tag",
            regex : "@[\\w\\d_]+" // TODO: fix email addresses
        }, {
            token : "comment.doc",
            merge : true,
            regex : "\\s+"
        }, {
            token : "comment.doc",
            merge : true,
            regex : "TODO"
        }, {
            token : "comment.doc",
            merge : true,
            regex : "[^@\\*]+"
        }, {
            token : "comment.doc",
            merge : true,
            regex : "."
        }]
    };
};

oop.inherits(DocCommentHighlightRules, TextHighlightRules);

DocCommentHighlightRules.getStartRule = function(start) {
    return {
        token : "comment.doc", // doc comment
        merge : true,
        regex : "\\/\\*(?=\\*)",
        next  : start
    };
};

DocCommentHighlightRules.getEndRule = function (start) {
    return {
        token : "comment.doc", // closing comment
        merge : true,
        regex : "\\*\\/",
        next  : start
    };
};


exports.DocCommentHighlightRules = DocCommentHighlightRules;

});

export {};
