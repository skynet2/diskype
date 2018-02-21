const Skyweb = require('skyweb');
const Eris = require("eris");
const credentials = require('./credentials.json');

const discord = new Eris(credentials.discordtoken, {autoreconnect: true, restMode: true});
const webSkype = new Skyweb();
const guidId = credentials.discordServerId;
const botId = credentials.discordBotId;

const channels = new Map();

formatChannelName = (input) => input.replace(/\W/g, '-');

handleException = (e) => {
    console.log(e); // todo;
};

pushMessageToDiscord = async (displayName, remoteLogin, content, isSecondCall) => {
    displayName = formatChannelName(displayName);

    if (!channels.has(remoteLogin)) {
        if (!isSecondCall) {
            await refreshDiscordChannelList(discord);

            return pushMessageToDiscord(displayName, remoteLogin, content, true);
        }
        try {
            let resp = await discord.createChannel(guidId, displayName, 0, 'input message', null);

            resp = await discord.editChannel(resp.id, {topic: remoteLogin}, 'set remote uuid');

            channels.set(remoteLogin, {id: resp.id, topic: resp.topic});
        }
        catch (e) {
            console.log(e);
        }
    }

    let localChannelId = channels.get(remoteLogin).id;

    if (localChannelId) {
        try {
            let channel = await discord.getChannel(localChannelId);

            if (channel) {
                channel.createMessage(content);
            }
        }
        catch (e) {
            handleException(e);
        }
    }

};
refreshDiscordChannelList = async (discord) => {
    try {
        let remoteChannels = await discord.getRESTGuildChannels(guidId);

        remoteChannels.forEach((val) => {
            if (!channels.has(val.topic)) {
                channels.set(val.topic, {id: val.id, topic: val.topic});
            }
        });
    }
    catch (e) {
        handleException(e);
    }
};
pushMessageToSkype = async (skype, discord, channelName, content, isSecondCall) => {
    if (channels.has(channelName))
        return pushMessageToSkypeByLogin(skype, channels.get(channelName).topic, content);

    if (!isSecondCall) {
        await refreshDiscordChannelList();
        return pushMessageToSkype(skype, discord, channelName, content, true);
    }
};
pushMessageToSkypeByLogin = (skype, login, content) => {
    try {
        skype.sendMessage(login, content);
    }
    catch (e) {
        handleException(e);
    }
};
init = async (skypeClient, discordClient, credentials) => {
    try {
        await skypeClient.login(credentials.skypeUser, credentials.skypePassword);

        skypeClient.messagesCallback = (messages) => {
            messages.forEach((message) => {
                if (message.resource && (message.resource.from.indexOf(credentials.skypeUser) === -1
                        && message.resource.messagetype !== 'Control/Typing'
                        && message.resource.messagetype !== 'Control/ClearTyping')) {

                    let conversationLink = message.resource.conversationLink;
                    let conversationId = conversationLink.substring(conversationLink.lastIndexOf('/') + 1);
                    // TODO Group chat
                    pushMessageToDiscord(message.resource.imdisplayname, conversationId, message.resource.content.replace(/<\/?[^>]+>/g, ''));
                }
            });
        }; // skype message callback

        discordClient.on("messageCreate", msg => {
            if (!msg || !msg.channel || !msg.channel.guild || msg.channel.guild.id !== guidId)
                return;

            if (msg.author.id === botId) // skip self messages
                return;

            pushMessageToSkype(skypeClient, discordClient, msg.channel.topic, msg.content);
        });


        discordClient.on("ready", async () => {
            await refreshDiscordChannelList(discordClient);

            console.log("Discord client is ready");
        });

        discordClient.on("error", function (e) {
            throw new Error(e);
        });

        skypeClient.on("error", function (e) {
            throw new Error(e);
        });

        discordClient.connect();
    }
    catch (e) {
        handleException(e);
    }
};

init(webSkype, discord, credentials);
