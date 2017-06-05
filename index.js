"use strict"

if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

let Botkit = require('botkit');
let pg = require('pg');

let controller = Botkit.slackbot({
    debug: false,
});
let bot = controller.spawn({
    token: process.env.token
}).startRTM();

// 各班ごとに受け取ったワードを一時的に格納するディレクトリ
var channelWordDir = {
}

// 今回ターゲットとしているチャンネルのIDリスト
var targetChannelList = ['G5LBPD8G6', 'G5JT69BDW']

var util = require('./functions/utility.js').UTIL;
var review = require('./functions/review_check.js').REVIEW;

// PostgreSQL
let connectionString = process.env.connectionstring;

let client;
controller.hears(['キャンセル', 'きゃんせる', 'cancel', 'やめる', 'やめて', '止める', '止めて'], 'ambient,direct_message,direct_mention,mention', (bot, message) => {
    // ステータスをデフォルト状態に戻す

    // SQLクエリに影響する文字列を置換
    message.text = message.text.replace(/'/g,"''");

    let groupChannel = message.channel;
    client = new pg.Client(connectionString);
    client.connect((err) => {
        // Utilityのプロパティ設定
        util.setProperty(bot, message, client);
        util.userAccessCountUp();
        if (err) {
            util.errorBotSay('キャンセル時のステータス確認時にエラー発生: ' + err)
            return;
        }

        // チャンネルからのメッセージの場合
        let select_qs = `SELECT * from Group_Status where group_id = '${groupChannel}';`
        let update_qs = `UPDATE Group_Status SET status = 0, stage = 0 , current_summary_id = 0, current_question = 0 where group_id = '${groupChannel}';`
        
        // チャンネルからのメッセージではない場合
        if (targetChannelList.indexOf(message.channel) == -1) {
            let userId = message.user
            select_qs = `SELECT * from User_Status where user_id = '${userId}';`
            update_qs = `UPDATE User_Status SET status = 0, stage = 0 , current_summary_id = 0, current_question = 0 where user_id = '${userId}';`
        }

        client.query(select_qs, (err, result) => {
            if (err) {
                util.errorBotSay('キャンセル時のステータス確認時にエラー発生: ' + err)
                client.end();
                return;
            }
            if (result.rows[0].status == 0 && result.rows[0].stage == 0) {
                // 処理の途中ではない場合
                if (message.event != 'ambient') {
                    util.botSay('んー、そう言われても..。 :droplet:', message.channel)
                }
                client.end();
            } else {
                // 処理の途中の場合
                client.query(update_qs, (err, result) => {
                    if (err) {
                        util.errorBotSay('キャンセル時のステータスアップデート時にエラー発生: ' + err)
                        client.end();
                        return;
                    }
                    channelWordDir[groupChannel] = ''
                    util.botSay('了解。処理を中断しました。', message.channel)
                    client.end();
                });
            }
        });
    });
});

// メインとなる処理
controller.hears('', 'ambient,direct_message,direct_mention,mention', (bot, message) => {
    // SQLクエリに影響する文字列を置換
    message.text = message.text.replace(/'/g,"''");

    let groupChannel = message.channel;
    client = new pg.Client(connectionString);
    client.connect((err) => {
        // Utilityのプロパティ設定
        util.setProperty(bot, message, client);
        if (err) {
            console.log('error: ' + err)
            return;
        }
        util.userAccessCountUp();

        // 現在のステータス取得
        let qs = `SELECT * FROM Group_Status WHERE group_id = '${groupChannel}';`
        if (targetChannelList.indexOf(message.channel) == -1) {
            let userId = message.user
            qs = `SELECT * from User_Status where user_id = '${userId}';`
        }
        client.query(qs, (err, result) => {
            if (err) {
                util.botSay('現在のステータス取得時にエラー発生: ' + err)
                client.end();
                return;
            }
            if (result.rowCount){
                // 現在のステータスにより処理を分ける
                switch (result.rows[0].status) {
                case 0:
                    // ノンステータス
                    if (message.event != 'ambient') {
                        selectMessage(message, result, groupChannel)
                    }
                    break;
                case 1:
                    // レビューチェック機能操作中ステータス
                    review.setProperty(bot, message, client, channelWordDir, targetChannelList);
                    review.reviewProcess(result, groupChannel, null)
                    break;
                case 2:
                    // レビューチェック開始
                    review.setProperty(bot, message, client, channelWordDir, targetChannelList);
                    review.reviewProcess(result, groupChannel, null)
                    break;
                }
            }
        });
    });
});

// ステータスが0の場合の処理
function selectMessage(message, status_result, groupChannel) {
    let qs = `SELECT message, status FROM Message WHERE '${message.text}' LIKE ANY(keyword);`
    client.query(qs, (err, result) => {
        if(err) {
            util.errorBotSay('現在のステータスが0ときのメッセージ取得時にエラー発生: ' + err)
            client.end();
            return;
        }
        if (result.rowCount == 1){
            // Messageの持つステータスにより処理を分ける
            switch (result.rows[0].status) {
            case 0:
                // Botとの対話が発生しない場合の処理
                let text = result.rows[0].message[0]
                if (text == 'parrot!') {
                    text = message.text + '!'
                }
                util.botSay(text, message.channel);
                client.end();
                break;
            case 1:
                // Botとレビュー一覧に関する対話が発生する場合
                if (message.channel != 'G5JT69BDW') {
                    util.updateStatus(1, 1, null, null, targetChannelList);
                }
                review.setProperty(bot, message, client, channelWordDir, targetChannelList);
                review.reviewProcess(status_result, groupChannel, result.rows[0].message);
                break;
            case 2:
                // Botとレビューチェックの対話が発生する場合
                util.updateStatus(2, 2, null, null, targetChannelList);
                review.setProperty(bot, message, client, channelWordDir, targetChannelList);
                review.reviewProcess(status_result, groupChannel,　result.rows[0].message);
                break;
            default :
                client.end();
            }
        } else if (result.rowCount > 1) {
            util.botSay('(んー、なんと答えるのがべきなのか...。。:disappointed_relieved:)\n端的に話してくれると嬉しいです！', message.channel);
        } else {
            util.botSay('対話できるBotをここに用意したい。', message.channel);
        }
    });
}

