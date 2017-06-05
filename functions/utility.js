"use strict"
let MAIN = {};
exports.UTIL = MAIN;

let bot;
let client;
let message;
// ファイル内で共通して利用するプロパティを定義
MAIN.setProperty = function setProperty(slackBot, recieveMessage, pgClient) {
    bot = slackBot;
    client = pgClient;
    message = recieveMessage;
}

/**
* ステータスの更新処理(引数がnullの項目は、更新されない)
* @param {number} status ステータス
* @param {number} stage 段階
* @param {number} current_summary_id レビューのサマリーID
* @param {number} current_question  レビューの質問ID
* @param {number} group_number グループ番号 
*/

MAIN.updateStatus = function updateStatus(status, stage, current_summary_id, current_question, targetChannelList) {
    let channelMatchFlag = (targetChannelList.indexOf(message.channel) >= 0)
    let qs = `UPDATE Group_Status SET `
    let groupChannel = message.channel
    let qsWhere = ` WHERE group_id = '${groupChannel}';`
    if (!channelMatchFlag) {
        let user = message.user;
        qs = `UPDATE User_Status SET `
        qsWhere = ` WHERE user_id = '${user}';`
    }
    if (status != null){
        qs = qs + `status = ${status}, `
    }
    if (stage != null){
        qs = qs + `stage = ${stage}, `
    }
    if (current_summary_id != null) {
        qs = qs + `current_summary_id = ${current_summary_id}, `
    }
    if (current_question != null) {
        qs = qs + `current_question = ${current_question}, `
    }
    qs = qs.substr( 0, qs.length-2 ) ;
    qs = qs + qsWhere;
    console.log(qs)
    client.query(qs, function(err, result) {
        if(err) {
            MAIN.errorBotSay('ステータス更新時にエラー発生: ' + err);
            client.end();
            return;
        }
    });
}

MAIN.userAccessCountUp = function userAccessCountUp() {
    let userId = message.user
    let qs = `UPDATE User_Status SET access_count = access_count + 1 WHERE user_id = '${userId}';`
    client.query(qs, function(err, result) {
        if(err) {
            MAIN.errorBotSay('ユーザーアクセスカウントアップ時にエラー発生: ' + err);
            client.end();
            return;
        }
    });
}

MAIN.updateUserStatus = function updateUserStatus(status, stage, current_summary_id, current_question, userId) {
    let qs = "UPDATE User_Status SET "
    if (status != null){
        qs = qs + `status = ${status}, `
    }
    if (stage != null){
        qs = qs + `stage = ${stage}, `
    }
    if (current_summary_id != null) {
        qs = qs + `current_summary_id = ${current_summary_id}, `
    }
    if (current_question != null) {
        qs = qs + `current_question = ${current_question}, `
    }
    qs = qs.substr( 0, qs.length-2 ) ;
    qs = qs + ` where user_id = ${userId};`
    client.query(qs, function(err, result) {
        if(err) {
            MAIN.errorBotSay('ステータス更新時にエラー発生: ' + err);
            client.end();
            return;
        }
    });
}

/**
* ステータスの更新処理(引数がnullの項目は、更新されない)
* @param {string} message 送信するメッセージ
* @param {string} channel 送信宛先(チャンネルのID)
*/
MAIN.botSay = function botSay(messageText, channel) {
    let tempMessage = String(messageText)
    if ( tempMessage.match(/\\n/)) {
        tempMessage = tempMessage.replace(/\\n/g,"\n");
    }
    bot.say({
        text: tempMessage,
        channel: channel
    });
} 

/**
* エラー発生時のメッセージ送信
* @param {string} error_message エラー内容
* @param {object} message Botkitで受け取ったmessageオブジェクト
*/
MAIN.errorBotSay = function errorBotSay(error_message) {
    console.log(error_message);
    MAIN.botSay(error_message , 'U5E0ZUTUM');
    MAIN.botSay('申し訳ございません。実行に失敗いたしました。。もう一度、異なる形式での入力をお願いします。'.channel);
}

/**
 * 指定されているチャンネルがターゲット一覧に存在するかチェック
 * 
 */
MAIN.isTargetChannel = function isTargetChannel(targetChannelList) {
    for (let channelId in targetChannelList) {
        console.log("いええええ:true:" + channelId)
        if (channelId == message.channel) {
            return true
        }
    }
    return false;
}