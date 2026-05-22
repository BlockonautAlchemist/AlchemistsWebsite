// Alchemist Streamers Hub — approved streamer registry.
//
// The data itself lives in streamers.json so both Node (serverless functions +
// `node --test`) and the Vite browser entry can consume the same source without
// mixing CommonJS `require` into browser modules.
//
// To add a streamer: append an object to streamers.json. `twitchUsername` MUST be
// lowercase (it is what we send to the Twitch Helix API as `user_login` / `login`).
//
// --- v2 / future hooks -------------------------------------------------------
// TODO(v2): A Discord bot can later sync members holding the "Alchemist Streamer"
//   role into this registry automatically. NOTE: a Discord role alone is not
//   enough — a member still has to register their Twitch username here, because
//   the Discord role carries no Twitch channel data. Keep `twitchUsername`
//   required even once Discord sync exists.
// ----------------------------------------------------------------------------

const alchemistStreamers = require('./streamers.json');

module.exports = { alchemistStreamers };
