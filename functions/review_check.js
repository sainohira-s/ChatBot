"use strict"
let MAIN = {};
exports.REVIEW = MAIN;
let util = require('./utility.js').UTIL;

let bot;
let client;
let message;
let channelWordDic;
let targetChannelList;
// ファイル内で共通して利用するプロパティを定義
MAIN.setProperty = function setProperty(slackBot, recieveMessage, pgClient, rChannelWordDic, rTargetChannelList) {
    bot = slackBot;
    client = pgClient;
    message = recieveMessage;
    channelWordDic = rChannelWordDic;
    targetChannelList = rTargetChannelList;
}

// レビューの段階によって処理を分ける
MAIN.reviewProcess = function reviewProcess(statusResult, groupChannel, bot_message) {
    switch (statusResult.rows[0].stage) {
    case 0:
        sendSummaryReviewList(statusResult, groupChannel, bot_message);
        break;
    case 1:
        sendTitleReviewList(groupChannel, statusResult);
        break;
    case 2:
        reviewCheck(statusResult, groupChannel);
        break;
    }
}

// レビュー一覧(サマリー)をメッセージで送る
function sendSummaryReviewList(statusResult, groupChannel, bot_message) {
    if (message.channel == 'G5JT69BDW') {
        sendReviewSummaryListAll(message);
        return;
    }
    let qs = `SELECT id, summary FROM Review_Summary ORDER BY id;`
    client.query(qs, function(err, summaryResult) {
        if(err) {
            util.errorBotSay('レビュー一覧(サマリー)取得時にエラー発生: ' + err)
            client.end();
            return;
        }
        let userId = message.user
        qs = `SELECT gs.group_id, group_name, user_id, user_name, 
            GS.passing_summary as g_passing_summary, US.passing_summary as u_passing_summary
            FROM Group_Status as GS INNER JOIN User_Status as US ON gs.group_id = us.group_id
            WHERE gs.group_id = (SELECT US.group_id FROM User_Status as US WHERE US.user_id = '${userId}');`
        client.query(qs, function(err, groupUsersResult) {
            if(err) {
                util.errorBotSay('全ユーザーのステータス取得(サマリー)取得時にエラー発生: ' + err)
                client.end();
                return;
            }
            let text = bot_message + '\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~'
            let passing_summary_list = statusResult.rows[0].passing_summary
            let isTargetChannel = (targetChannelList.indexOf(message.channel) >= 0);
            summaryResult.rows.forEach((summaryInfo, index) => {
                // if (passing_summary_list.indexOf(summaryInfo.id.toString()) >= 0) {
                // }
                let channelPassingSummaryFlag = false
                let userPassingSummaryFlag = false
                let userNames = '';
                groupUsersResult.rows.forEach((userStatus, index, array) => {
                    userStatus.g_passing_summary.forEach((summaryId, index, array) => {
                        if (summaryInfo.id == summaryId) {
                            channelPassingSummaryFlag = true
                            userPassingSummaryFlag = true
                            return;
                        }
                    });
                    if (channelPassingSummaryFlag) {
                        return;
                    }                    
                    userStatus.u_passing_summary.forEach((summaryId, index, array) => {
                        if (summaryInfo.id == summaryId) {
                            if (userStatus.user_id == message.user) {
                                userPassingSummaryFlag = true
                            }
                            userNames = userNames + userStatus.user_name + ', '
                            return;
                        }
                    });
                });
                userNames = (userNames)?'(' + userNames.substr(0, userNames.length-2) + ')':'';
                let flagText = ''
                if (isTargetChannel) {
                    flagText = (channelPassingSummaryFlag)?':white_check_mark:':':white_large_square:'
                } else {
                    flagText = (userPassingSummaryFlag)?':white_check_mark:':':white_large_square:'
                }
                
                text = text + '\n ' + flagText + '  '+ summaryInfo.id + '.  *' + summaryInfo.summary + '*  ' + userNames;
            });
            text = text + '\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~'
            util.botSay(text, message.channel)
            client.end();
        });
    });
}

// レビュータイトルと質問の一覧をメッセージで送る
function sendTitleReviewList(groupChannel, statusResult) {
    let qs = `SELECT RS.id as summary_id, RS.summary, title_number, title, RQ.id as question_id, question_number, question
            FROM ((Review_Summary as RS inner join Title_Category as TC ON category_number = RS.title_category)
            inner join Review_TItle as RT ON category_number = RT.title_category)
            inner join Review_Question as RQ ON title_id = RT.id 
            WHERE '${message.text}' LIKE ANY(RS.keyword) 
            ORDER BY title_id, question_number;`
    client.query(qs, function(err, questionResult) {
        if (err) {
            util.errorBotSay('レビューチェック実施(サマリー取得)時のデータ取得時にエラー発生: ' + err);
            client.end();
            return;
        }
        // 一致する項目がない場合
        if (!questionResult.rowCount) {
            util.botSay('その内容と一致する項目は見当たらないため、もう一度入力をお願いします:bow:', message.channel);
            client.end();
            return;
        }
        let summaryId = questionResult.rows[0].summary_id;
        // 複数の項目が選択されていた場合
        for (let i in questionResult.rows) {
            if (questionResult.rows[i].summary_id != summaryId) {
                util.botSay('複数の選択が確認されました。もう一度、選択してください。', message.channel);
                client.end();
                return;
            }
        }    
        // サマリーに該当する全質問のリストを生成
        let questionList = [];
        questionResult.rows.forEach((questionInfo, index) => {
            let question = questionInfo.question_id;
            questionList.push(`${summaryId}_${question}`);
        })
        let questionInfoList = [];
        let useQuestionList = questionResult.rows;
        let allPassingQuestionList = statusResult.rows[0].passing_question;
        let passingQuestionList = allPassingQuestionList.filter((question, index, array) => {
            return (question.match(`${summaryId}_`))
        });
        let notPassingQuestionList = questionList.concat();
        allPassingQuestionList.forEach((question, index) => {
            let questionIndex = useQuestionList.indexOf(question)
            if (questionIndex >= 0) {
                notPassingQuestionList.splice(questionIndex, 1)
            }
        });

        // メッセージ文作成
        let text = '*' + questionResult.rows[0].summary + '* のレビューチェック一覧です。';
        text = text + '\n\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ ';
        questionResult.rows.forEach((questionInfo, index) => {
            
            // 合格した項目かチェック
            let showQuestionFlag = false
            passingQuestionList.forEach((question, index) => {
                let questionId = question.replace(`${summaryId}_`, '')
                if (questionInfo.question_id == questionId) {
                    showQuestionFlag = true
                    return;
                }
            });

            let flagText = ':white_large_square:';
            let flagStrike = '';
            if (showQuestionFlag) {
                flagText = ':white_check_mark:';
                flagStrike = '~';
            }

            let question_text = questionInfo.question;
            if ( question_text.match(/\\n/)) {
                question_text = question_text.replace(/\\n/g, flagStrike + '\n');
                question_text = question_text.replace(/→/g, flagStrike + '→');
            }

            // 質問項目の作成
            function questionTextGenerate() {
                // if (!text.match(questionInfo.title)) {
                if (index == 0){
                    text = text + '\n\n ' + questionInfo.title_number + '. *' + questionInfo.title + '*';
                } else if (questionInfo.title_number != questionResult.rows[index-1].title_number) {
                    text = text + '\n\n ' + questionInfo.title_number + '. *' + questionInfo.title + '*';
                }

                text = text + '\n        ' + flagText + '   '+ flagStrike + questionInfo.title_number +'-' + questionInfo.question_number +'. ' + question_text + flagStrike;
            }

            if (message.text.match(/OK/i) && message.text.match(/NG/i)) {
                questionTextGenerate();
            } else if (message.text.match(/OK/i)) {
                if (showQuestionFlag) {
                    questionTextGenerate();
                }
            } else if (message.text.match(/NG/i)) {
                if (showQuestionFlag == false) {
                    questionTextGenerate();
                }
            } else {
                questionTextGenerate();
            }
        });
        text = text + '\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~';
        util.botSay(text, message.channel);
        util.updateStatus(0, 0, null, null, targetChannelList);
        client.end();
    });
}

// レビューチェック実施
function reviewCheck(statusResult, groupChannel) {
    //　チェック始めの処理
    let qs = `SELECT * FROM Review_Summary WHERE `
    let currentSummaryId = statusResult.rows[0].current_summary_id
    if (currentSummaryId == 0) {
        qs= qs + `'${message.text}' LIKE ANY(keyword)`
        if (message.text.match(/OK/i) && message.text.match(/NG/i)) {
            // OK・NG判定のどちらも表示
        } else if (message.text.match(/OK/i)) {
            channelWordDic[groupChannel] = 'OK'
        } else if (message.text.match(/NG/i)) {
            channelWordDic[groupChannel] = 'NG'
        }
    } else {
        qs= qs + `id = ${currentSummaryId} `
    }
    client.query(qs, function(err, summaryResult) {
        if (err) {
            util.errorBotSay('レビューチェック実施(サマリー取得)時のデータ取得時にエラー発生: ' + err);
            client.end();
            return;
        }
        if (!summaryResult.rowCount){
            util.botSay('1つの項目を選択してください。', message.channel);
            return;
        } else if (summaryResult.rowCount > 1){
            util.botSay('複数の選択が確認されました。もう一度、選択してください。', message.channel);
            return;
        }
        let summaryId = summaryResult.rows[0].id
        let summaryTitleCategory = summaryResult.rows[0].title_category
        let passingQuestionList = statusResult.rows[0].passing_question
        let passingQuestionIdList = []
        passingQuestionList.forEach((value, index) => {
            if (value.match(`${summaryId}_`)){
                passingQuestionIdList.push(parseInt(value.replace(`${summaryId}_`, '')));
            } else if (value.match(`0_0`)){
                passingQuestionIdList.push(0);                
            }
        });
        
        let qs = `SELECT title, title_number, RQ.id as question_id, question, question_number 
                FROM (Title_Category as TC inner join Review_TItle as RT ON category_number = RT.title_category)
                inner join Review_Question as RQ ON title_id = RT.id 
                WHERE RT.title_category = ${summaryTitleCategory} `
        if (channelWordDic[groupChannel] == 'OK') {
            qs= qs + `AND RQ.id = ANY(ARRAY[${passingQuestionIdList}]) `
        } else if (channelWordDic[groupChannel] == 'NG') {
            qs= qs + `AND NOT RQ.id = ANY(ARRAY[${passingQuestionIdList}]) `
        }
        qs = qs +  `ORDER BY RT.id DESC, question_number DESC;`
        client.query(qs, function(err, result) {
            if(err) {
                util.errorBotSay('レビューチェック実施(質問一覧取得)時のデータ取得時にエラー発生: ' + err);
                client.end();
                return;
            } else {
                if (!result.rowCount) {
                    util.botSay('該当する項目がありませんでした。もう一度入力してください。', message.channel);
                    return;
                }
                let text = '';
                let questionNumber = parseInt(statusResult.rows[0].current_question);
                if (statusResult.rows[0].current_summary_id == 0) {
                    text = text + '`' + summaryResult.rows[0].summary + '` のレビューチェック(全 `' + result.rowCount + '` 項目)を開始します。OK/NGで回答してください。';
                    util.updateStatus(2, 2, summaryId, result.rowCount, targetChannelList);
                    questionNumber = parseInt(result.rowCount - 1 );
                } else {
                    let judge = false;
                    if (message.text.match(/OK/i) && message.text.match(/NG/i)) {
                        util.botSay('OKかNGか判断できませんでした。もう一度入力をお願いします。', message.channel);
                        return;                        
                    } else if (message.text.match(/OK/i)) {
                        judge = true;
                    } else if (message.text.match(/NG/i)) {
                        judge = false;
                    } else {
                        util.botSay('OKか、NGで答えてください。(「キャンセル」で途中終了も可能です。)', message.channel);
                        return;
                    }
                    let channelMatchFlag = (targetChannelList.indexOf(message.channel) >= 0);
                    updateReviewResult(groupChannel, summaryId, result.rows[questionNumber], statusResult, channelMatchFlag, judge);
                    questionNumber = questionNumber - 1;
                    if (questionNumber == -1) {
                        channelWordDic[groupChannel] = '';
                        util.updateStatus(0, 0, 0, 0, targetChannelList);
                        updateReviewSummaryResult(statusResult, groupChannel, summaryId, message.channel, channelMatchFlag);
                        return;
                    }
                }

                if (questionNumber == result.rowCount -1) {
                    text = text + '\n' + result.rows[questionNumber].title_number + '. *' + result.rows[questionNumber].title + '* \n';
                } else if (result.rows[questionNumber].title_number != result.rows[Number(questionNumber+1)].title_number) {
                    text = text + '\n' + result.rows[questionNumber].title_number + '. *' + result.rows[questionNumber].title + '* \n';
                }

                text = text + '```\n        ' + result.rows[questionNumber].title_number +'-' + result.rows[questionNumber].question_number +'. ' + result.rows[questionNumber].question + '\n```';
                util.botSay(text, message.channel);
                util.updateStatus(null, null, null, questionNumber, targetChannelList);
            }
        });    
    });
}

// レビュー結果を更新
function updateReviewResult(groupChannel, summaryId, questionInfo, statusResult, channelMatchFlag, judge) {
    let passingQuestion = summaryId + "_" + questionInfo.question_id;
    let passingQuestionList = statusResult.rows[0].passing_question;
    let index = passingQuestionList.indexOf(passingQuestion);
    if (index >= 0) {
        if (judge) {
            return;
        }
        passingQuestionList.splice(index, 1);
    } else {
        if (!judge){
            return;
        }
        passingQuestionList.push(passingQuestion);
    }
    let passingQuestionListStr = fromArrayToString(passingQuestionList);
    let qs = `UPDATE Group_Status SET passing_question = ARRAY[${passingQuestionListStr}] WHERE group_id = '${groupChannel}';`
    if (channelMatchFlag == false) {
        let userId = message.user;
        qs = `UPDATE User_Status SET passing_question = ARRAY[${passingQuestionListStr}] WHERE user_id = '${userId}';`
    }
    client.query(qs, function(err, result) {
        if(err) {
            util.errorBotSay('レビュー質問一覧更新時にエラー発生: ' + err);
            client.end();
            return;
        }
    });
}

function updateReviewSummaryResult(oldStatusResult, groupChannel, summaryId, crrent_channel, channelMatchFlag) {
    let qs = `SELECT * FROM Group_Status WHERE group_id = '${groupChannel}';`
    let userId = message.user
    if (channelMatchFlag == false) {
        qs = `SELECT * FROM User_Status WHERE user_id = '${userId}';`
    }
    client.query(qs, function(err, statusResult) {
        if(err) {
            util.errorBotSay('レビューサマリーアップデート時のステータス確認時にエラー発生: ' + err);
            client.end();
            return;
        } else {
            qs = `SELECT RS.id as summary_id, RS.summary, title, title_number, RQ.id as question_id, question_number, question
                FROM ((Review_Summary as RS inner join Title_Category as TC ON category_number = RS.title_category)
                inner join Review_TItle as RT ON category_number = RT.title_category)
                inner join Review_Question as RQ ON title_id = RT.id 
                WHERE RS.id = ${summaryId};`
            client.query(qs, function(err, questionResult) { 
                console.log(statusResult.rows[0])
                let passingQuestionList = statusResult.rows[0].passing_question            
                let judge = true    // レビュー項目に合格しているかどうか
                for (let i in questionResult.rows){
                    let question = questionResult.rows[i].summary_id + "_" + questionResult.rows[i].question_id
                    if (!(passingQuestionList.indexOf(question) >= 0)){
                        judge = false
                        break;
                    }
                }
                
                let passingSummaryList = statusResult.rows[0].passing_summary;
                let index = passingSummaryList.indexOf(questionResult.rows[0].summary_id.toString());
                if (index >= 0) {
                    if (!judge){
                        passingSummaryList.splice(index, 1);
                    }
                } else {
                    if (judge){
                        passingSummaryList.push(summaryId);
                    }
                }

                qs = `UPDATE Group_Status SET passing_summary = ARRAY[${passingSummaryList}] WHERE group_id = '${groupChannel}';`
                if (channelMatchFlag == false) {
                    qs = `UPDATE User_Status SET passing_summary = ARRAY[${passingSummaryList}] WHERE user_id = '${userId}';`
                }
                client.query(qs, function(err, result) {
                    if(err) {
                        util.errorBotSay('レビューサマリー更新時にエラー発生: ' + err);
                        client.end();
                        return;
                    }

                    let text = 'セルフレビューチェック終了です。お疲れ様でした。\n'
                    // 全ユーザーの情報(ステータス)を取得
                    qs = `SELECT gs.group_id, group_name, user_id, user_name, 
                        GS.passing_summary as g_passing_summary, GS.passing_question as g_passing_question,  
                        US.passing_summary as u_passing_summary, US.passing_question as u_passing_question 
                        FROM Group_Status as GS INNER JOIN User_Status as US ON gs.group_id = us.group_id;` 
                    client.query(qs, function(err, groupUsersResult) {
                        if(err) {
                            util.errorBotSay('ユーザーのステータス更新時のユーザーステータス取得時にエラー発生: ' + err);
                            client.end();
                            return;
                        }
                        let summaryIdStr= summaryId.toString()
                        let userName = ''
                        let userGroupId = ''
                        let userGroupName = ''
                        let userPassingQuestionList = []
                        let groupPassingSummaryList = []
                        let groupPassingQuestionList = []
                        groupUsersResult.rows.forEach((userStatusInfo, index) => {
                            if (userStatusInfo.user_id == userId) {
                                userName = userStatusInfo.user_name
                                userGroupId = userStatusInfo.group_id
                                userGroupName = userStatusInfo.group_name
                                userPassingQuestionList = userStatusInfo.u_passing_question
                                groupPassingSummaryList = userStatusInfo.g_passing_summary
                                groupPassingQuestionList = userStatusInfo.g_passing_question
                            }
                        });

                        // サマリーに該当する全質問のリストを生成
                        let questionList = [];
                        questionResult.rows.forEach((questionInfo, index) => {
                            let question = questionInfo.question_id;
                            questionList.push(`${summaryId}_${question}`);
                        })

                        // 全て合格の場合
                        if (judge) {
                            if (channelMatchFlag) {
                                // 班チャンネルからのメッセージの場合
                                if (oldStatusResult.rows[0].passing_summary.indexOf(`${summaryIdStr}`) == -1) {
                                    // 合格していない状態の場合
                                    let groupPassingQuestionListStr = fromArrayToString(groupPassingQuestionList);
                                    qs = `UPDATE User_Status SET passing_summary = ARRAY[${groupPassingSummaryList}], passing_question = ARRAY[${groupPassingQuestionListStr}] WHERE group_id = '${userGroupId}';`
                                    client.query(qs, function(err, result) {
                                        if(err) {
                                            util.errorBotSay('全ユーザーのステータス更新時にエラー発生: ' + err);
                                            client.end();
                                            return;
                                        }
                                        util.botSay(statusResult.rows[0].group_name + 'が `' + questionResult.rows[0].summary + '` のセルフレビューチェックを完了しました。', 'G5JT69BDW')
                                        util.botSay(text + 'レビューメンバーのチャンネルにセルフレビューチェックが完了した旨を通知しました。\n(ユーザー毎のステータスも合格に更新されました。)', crrent_channel)
                                        client.end();
                                        return;
                                    });

                                } else {
                                    // 既に合格の状態の場合
                                    util.botSay('`'+ questionResult.rows[0].summary + '` は既に合格していますね。レビュアーへの通知は不要ですね。', groupChannel);
                                    client.end();
                                    return;
                                }
                            } else {
                                // 班チャンネル以外からのメッセージの場合
                                // 班全員が合格しているのかチェック
                                let allPassingFlag = true;
                                
                                groupUsersResult.rows.forEach((userStatusInfo, index) => {
                                    if (userStatusInfo.group_id == userGroupId) {
                                        questionList.forEach((question, index) => {
                                            if (userStatusInfo.u_passing_question.indexOf(question) == -1) {
                                                allPassingFlag = false;
                                                return;
                                            }
                                        });
                                        if (allPassingFlag == false) {
                                            return;
                                        }
                                    }
                                });

                                if (allPassingFlag) {
                                    // 班全員が合格場合
                                    if (groupPassingSummaryList.indexOf(`${summaryIdStr}`) == -1) {
                                        // 班のステータスが合格状態でない場合
                                        // 合格したサマリーを更新するためのリストを生成
                                        groupPassingSummaryList.push(summaryId)
                                        
                                        // ユーザーの回答を元にチャンネルのレビュー合格ステータスを更新
                                        // 指定されたサマリーに該当する合格項目を抽出
                                        let passingQuestionListForSummary = userPassingQuestionList.filter(function(passingQuestion, index, array) {
                                            return passingQuestion.match(`${summaryId}_`);
                                        });
                                        // チャンネルの合格ステータスに存在しない項目を追加
                                        passingQuestionListForSummary.forEach((passingQuestion, index) => {
                                            if (groupPassingQuestionList.indexOf(passingQuestion) == -1) {
                                                groupPassingQuestionList.push(passingQuestion);
                                            }
                                        });
                                        let passingQuestionListStr = fromArrayToString(groupPassingQuestionList);
                                        // 班のチャンネルのステータスを合格へ更新する
                                        qs = `UPDATE Group_Status SET passing_summary = ARRAY[${groupPassingSummaryList}], passing_question = ARRAY[${passingQuestionListStr}] 
                                            WHERE group_id = '${userGroupId}';`
                                        client.query(qs, function(err, result) {
                                            if(err) {
                                                util.errorBotSay('ユーザーのステータス更新時の全ユーザーステータス取得時にエラー発生: ' + err);
                                                client.end();
                                                return;
                                            }
                                            util.botSay(userGroupName + 'が `' + questionResult.rows[0].summary + '` のセルフレビューチェックを完了しました。', 'G5JT69BDW');
                                            util.botSay(userName + 'さんが `' + questionResult.rows[0].summary + '` のセルフレビューチェックを完了しました。', userGroupId)
                                            text = text + '\n班員に `'+ questionResult.rows[0].summary + '` のセルフレビューチェックが完了したことを通知しました。';
                                            util.botSay(text + '\n班全員がセルフレビューチェックを完了したため、レビュアーメンバーのチャンネルに完了した旨を通知しました。', crrent_channel);
                                            client.end();
                                            return;
                                        });
                                    // 既に合格している場合                                    
                                    } else {
                                        util.botSay('`'+ questionResult.rows[0].summary + '` は既に合格していますね。レビュアーと班員への通知は不要ですね。', groupChannel);
                                        client.end();
                                        return;
                                    }
                                } else {
                                    util.botSay(userName + 'さんが `' + questionResult.rows[0].summary + '` のセルフレビューチェックを完了しました。', userGroupId)
                                    util.botSay(text + '\n班員に `'+ questionResult.rows[0].summary + '` のセルフレビューチェックが完了したことをお伝えました。', groupChannel);
                                    client.end();
                                    return;
                                }
                            }
                        } else {
                            //　不合格項目がある場合    
                            let questionInfoList = questionResult.rows
                            // 全質問のIDリスト
                            let questionIdList = [];
                            questionInfoList.forEach((questionInfo) => {
                                questionIdList.push(questionInfo.question_id)
                            });
                            // OK判定の質問IDリスト
                            let passingQuestionIdList = []
                            statusResult.rows[0].passing_question.forEach((value) => {
                                if (value.match(`${summaryId}_`)) {
                                    let questionId = value.replace(`${summaryId}_`, '')
                                    passingQuestionIdList.push(parseInt(questionId))    
                                }
                            });
                            // NG判定の質問IDリスト
                            let nonPassingQuestionIdList = questionIdList.filter((questionId, index) => {
                                return !(passingQuestionIdList.indexOf(questionId) >= 0)
                            });
                            text = text + '`' + questionResult.rows[0].summary + '` のNGだった項目は以下のとおりです。\n\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ \n'
                            questionInfoList.forEach((questionInfo) => {
                                if (nonPassingQuestionIdList.indexOf(questionInfo.question_id) >= 0) {
                                    if (!text.match(questionInfo.title)) {
                                        text = text + '\n\n ' + questionInfo.title_number + '. *' + questionInfo.title + '*'
                                    }
                                    let flagText = ':white_large_square:'
                                    let questionText = questionInfo.question
                                    if (questionText.match(/\\n/)) {
                                        questionText = questionText.replace(/\\n/g, '\n');
                                        questionText = questionText.replace(/→/g, '→');
                                    }
                                    text = text + '\n        ' + flagText + '   ' + questionInfo.title_number +'-' + questionInfo.question_number +'. ' + questionText
                                }
                            });
                            text = text + '\n\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~'
                            util.botSay(text, crrent_channel)

                            let groupPassingSummary = groupPassingSummaryList.indexOf(`${summaryIdStr}`)
                            // 班チャンネル以外からのメッセージの場合
                            if (channelMatchFlag == false) {
                                // 既に合格していた場合
                                if (groupPassingSummary >= 0) {
                                    groupPassingSummaryList.splice(groupPassingSummary, 1)
                                    
                                    // 合格した質問一覧を更新するための文字列(passingQuestionListStr)を生成
                                    questionList.forEach((question, index) => {
                                        let groupPassingQuestion = groupPassingQuestionList.indexOf(question);
                                        groupPassingQuestionList.splice(groupPassingQuestion, 1);
                                    });
                                    let passingQuestionListStr = fromArrayToString(groupPassingQuestionList);
                                    qs = `UPDATE Group_Status SET passing_summary = ARRAY[${groupPassingSummaryList}], passing_question = ARRAY[${passingQuestionListStr}] 
                                        WHERE group_id = '${userGroupId}';`
                                    client.query(qs, function(err, result) {
                                        if(err) {
                                            util.errorBotSay('ユーザーのステータス更新時の全ユーザーステータス取得時にエラー発生: ' + err);
                                            client.end();
                                            return;
                                        }
                                        util.botSay(userGroupName + 'が `' + questionResult.rows[0].summary + '` のセルフレビューチェック(個人)で不合格がでたため【合格 → 不合格】になりました。', 'G5JT69BDW')
                                        util.botSay('班の合格ステータスが不合格になったとことをレビュアーメンバーに通知しました。', crrent_channel)
                                        client.end();
                                        return;
                                    });
                                }
                            } else {
                                if (groupPassingSummary >= 0) {
                                    util.botSay(userGroupName + 'が `' + questionResult.rows[0].summary + '` のセルフレビューチェックで【合格 → 不合格】になりました。', 'G5JT69BDW')
                                    util.botSay('班の合格ステータスが不合格になったとことをレビュアーメンバーに通知しました。', crrent_channel)
                                    client.end();
                                }
                            }
                        }
                    });
                });
            });
        }
    });
}

function sendReviewSummaryListAll (message) {
    let qs = `select id, summary from Review_Summary ORDER BY id;`
    client.query(qs, function(err, summaryResult) {
        if(err) {
            util.errorBotSay('サマリー一覧取得時にエラー発生: ' + err);
            client.end();
            return;
        }
        let channel = message.channel
        qs = `SELECT * FROM Group_Status WHERE NOT group_id = '${channel}' ORDER BY group_name`
        client.query(qs, function(err, allGroupStatusResult) {
            if(err) {
                util.errorBotSay('レビュー全班一覧取得時にエラー発生: ' + err);
                client.end();
                return;
            }
            let text = '各班のレビュー状況です。\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~';
            allGroupStatusResult.rows.forEach((groupStatus, index) => {
                let groupId = groupStatus.group_id;
                qs = `SELECT * FROM User_Status WHERE group_id = '${groupId}' ORDER BY user_id`
                let menberListText = ''
                client.query(qs, function(err, allUserStatusResult) {
                    if(err) {
                        util.errorBotSay('班員一覧取得時にエラー発生: ' + err);
                        client.end();
                        return;
                    }
                    allUserStatusResult.rows.forEach((userStatusResult, index, array) => {
                        menberListText = menberListText + userStatusResult.user_name +', '
                    })
                    menberListText = menberListText.substr( 0, menberListText.length-2 );
                    let groupName = groupStatus.group_name;
                    text = text + `\n \`${groupName}\`  (${menberListText})`;
                    summaryResult.rows.forEach((summaryInfo, index) => {
                        let flagText = (groupStatus.passing_summary.indexOf(summaryInfo.id.toString()) >= 0)?':white_check_mark:':':white_large_square:';
                        text = text + '\n ' + flagText + '  '+ summaryInfo.id + '.  *' + summaryInfo.summary + '*';
                    })
                    text = text + '\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~';
                    console.log(allGroupStatusResult.length)
                    console.log(index)
                    if ((allGroupStatusResult.rowCount - 1)  == index) {
                        util.botSay(text, message.channel);
                        client.end();
                    }
                });
            })
        });
    });
}

function fromArrayToString(arrayList) {
    let arrayListStr = ''
    arrayList.forEach((value) => {
        arrayListStr = arrayListStr + `'${value}', `
    });
    arrayListStr = (arrayListStr)?arrayListStr.substr(0, arrayListStr.length-2):`''` ;
    return arrayListStr
}