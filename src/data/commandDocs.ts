/**
 * Static documentation for every non-dev-tier `::` chat command, for the public
 * `/commands` website page (issue #55).
 *
 * `::` commands split into two entirely separate code paths with no shared
 * registry between them (see the "Client-local command vs. server cheat
 * command" entry in `.claude/context/CONTEXT.md`):
 *
 * - **player** tier: matched literally client-side in
 *   `client/src/client/Client.ts` (~line 3148-3184). No server round-trip, no
 *   `staffModLevel` gate — available to every player.
 * - **moderator** tier (`staffModLevel >= 2`) and **administrator** tier
 *   (`staffModLevel >= 3`): handled server-side in
 *   `engine/src/network/game/client/handler/ClientCheatHandler.ts`.
 *
 * The dev tier (`staffModLevel >= 4`, only runs when
 * `!Environment.node.production`) is intentionally excluded — those commands
 * are non-functional on the live server.
 *
 * This list is hand-authored from the actual handler code, not derived from
 * command names (several names are misleading — see `minme` below, which
 * resets ALL stats rather than acting on a single one). It does not change at
 * runtime, so it is stored as a plain static array rather than computed from
 * the handler source on each request.
 */

export type CommandTier = 'player' | 'moderator' | 'administrator';

export interface CommandDoc {
    /** Command name including the leading `::`, e.g. `::zoom`. */
    command: string;
    tier: CommandTier;
    /** Usage signature shown in the docs table, e.g. `::zoom <number 400-1800>`. */
    syntax: string;
    description: string;
    example: string;
}

export const CommandTierLabel: { [key in CommandTier]: string } = {
    player: 'Player',
    moderator: 'Moderator',
    administrator: 'Administrator'
};

/**
 * All 39 in-scope commands (6 player + 11 moderator + 22 administrator).
 *
 * Note: issue #55's own header counts ("11 moderator, 21 administrator, 38
 * total") undercount the administrator tier by one relative to both its own
 * enumerated command list and the actual `ClientCheatHandler.ts` source — the
 * named list of 22 administrator commands (`setvar` through `snapshot`) is
 * complete and matches the code exactly; the summary arithmetic was off by
 * one. Flagged on the issue rather than treated as an open design decision,
 * since which commands belong was never ambiguous.
 */
export const commandDocs: CommandDoc[] = [
    // --- player tier (client-local, Client.ts ~3148-3184) ---
    {
        command: '::fpson',
        tier: 'player',
        syntax: '::fpson',
        description: 'Shows the on-screen FPS (frames per second) counter.',
        example: '::fpson'
    },
    {
        command: '::fpsoff',
        tier: 'player',
        syntax: '::fpsoff',
        description: 'Hides the on-screen FPS counter.',
        example: '::fpsoff'
    },
    {
        command: '::fps',
        tier: 'player',
        syntax: '::fps <number>',
        description: "Sets the client's targeted frame rate, in frames per second.",
        example: '::fps 60'
    },
    {
        command: '::zoom',
        tier: 'player',
        syntax: '::zoom <number 400-1800>',
        description: "Sets the camera's zoom distance directly (400-1800). Useful on mobile, which has no scroll wheel.",
        example: '::zoom 1200'
    },
    {
        command: '::xptrackeron',
        tier: 'player',
        syntax: '::xptrackeron',
        description: 'Shows an on-screen XP/hour tracker overlay, and remembers the setting for future sessions.',
        example: '::xptrackeron'
    },
    {
        command: '::xptrackeroff',
        tier: 'player',
        syntax: '::xptrackeroff',
        description: 'Hides the on-screen XP/hour tracker overlay, and remembers the setting for future sessions.',
        example: '::xptrackeroff'
    },

    // --- moderator tier (staffModLevel >= 2, ClientCheatHandler.ts) ---
    {
        command: '::getcoord',
        tier: 'moderator',
        syntax: '::getcoord',
        description: 'Displays your current coordinate (height level, map square, and local tile) in the chat box.',
        example: '::getcoord'
    },
    {
        command: '::tele',
        tier: 'moderator',
        syntax: '::tele <level,squareX,squareZ[,localX,localZ]>',
        description: "Teleports you to the given coordinate. Level, map-square X/Z, and optional local tile X/Z are comma-separated in a single argument (local tile defaults to the square's center).",
        example: '::tele 0,50,50,32,32'
    },
    {
        command: '::teleto',
        tier: 'moderator',
        syntax: '::teleto <username>',
        description: "Teleports you to the given player's location.",
        example: '::teleto Zezima'
    },
    {
        command: '::setvis',
        tier: 'moderator',
        syntax: '::setvis <0|1|2>',
        description:
            'Sets your visibility: 0 restores normal visibility and collision, 2 hides you from other players\' view and removes your collision. 1 ("soft" hidden) is currently stubbed server-side and does nothing but print a not-implemented message.',
        example: '::setvis 2'
    },
    {
        command: '::ban',
        tier: 'moderator',
        syntax: '::ban <username> <minutes>',
        description: 'Bans a player from the server for the given number of minutes.',
        example: '::ban Choppermad 60'
    },
    {
        command: '::mute',
        tier: 'moderator',
        syntax: '::mute <username> <minutes>',
        description: 'Prevents a player from using chat for the given number of minutes.',
        example: '::mute Lynx153 30'
    },
    {
        command: '::kick',
        tier: 'moderator',
        syntax: '::kick <username>',
        description: 'Disconnects a player from the server immediately, if they are currently online.',
        example: '::kick Lynx153'
    },
    {
        command: '::xprate',
        tier: 'moderator',
        syntax: '::xprate <positive integer>',
        description: 'Sets the global XP rate multiplier applied to all players. Add -h for the built-in usage message.',
        example: '::xprate 3'
    },
    {
        command: '::droprate',
        tier: 'moderator',
        syntax: '::droprate <positive integer>',
        description: 'Sets the global drop rate multiplier applied to all players. Add -h for the built-in usage message.',
        example: '::droprate 2'
    },
    {
        command: '::rates',
        tier: 'moderator',
        syntax: '::rates',
        description: 'Shows the current global XP and drop rate multipliers. Add -h for the built-in usage message.',
        example: '::rates'
    },
    {
        command: '::help',
        tier: 'moderator',
        syntax: '::help',
        description: 'Lists the available custom staff commands (::xprate, ::droprate, ::rates, ::help) and how to see detailed usage for each via -h.',
        example: '::help'
    },

    // --- administrator tier (staffModLevel >= 3, ClientCheatHandler.ts) ---
    {
        command: '::setvar',
        tier: 'administrator',
        syntax: '::setvar <variable> <value>',
        description: 'Sets a server-side script variable (varp or varbit), looked up by its debug name, to the given value.',
        example: '::setvar questpoints 5'
    },
    {
        command: '::setvarother',
        tier: 'administrator',
        syntax: '::setvarother <username> <variable> <value>',
        description: 'Sets a server-side script variable on another currently-online player, looked up by its debug name.',
        example: '::setvarother Zezima questpoints 5'
    },
    {
        command: '::getvar',
        tier: 'administrator',
        syntax: '::getvar <variable>',
        description: 'Displays the current value of a server-side script variable (varp or varbit), looked up by its debug name, in the chat box.',
        example: '::getvar questpoints'
    },
    {
        command: '::getvarother',
        tier: 'administrator',
        syntax: '::getvarother <username> <variable>',
        description: 'Displays the current value of a server-side script variable on another currently-online player.',
        example: '::getvarother Zezima questpoints'
    },
    {
        command: '::give',
        tier: 'administrator',
        syntax: '::give <item> [amount]',
        description: 'Spawns the given item into your own inventory (amount defaults to 1).',
        example: '::give 1265 1'
    },
    {
        command: '::giveother',
        tier: 'administrator',
        syntax: '::giveother <username> <item> [amount]',
        description: "Spawns the given item into another currently-online player's inventory (amount defaults to 1).",
        example: '::giveother Zezima 1265 1'
    },
    {
        command: '::givecrap',
        tier: 'administrator',
        syntax: '::givecrap',
        description: 'Fills all 28 of your inventory slots with random tradeable items, excluding noted/certificate items and, on a free-to-play world, members items.',
        example: '::givecrap'
    },
    {
        command: '::givemany',
        tier: 'administrator',
        syntax: '::givemany <item>',
        description: 'Adds 1000 of the given item to your inventory.',
        example: '::givemany 995'
    },
    {
        command: '::broadcast',
        tier: 'administrator',
        syntax: '::broadcast <message>',
        description: 'Sends a message to every player currently online.',
        example: '::broadcast Server restarting in 5 minutes.'
    },
    {
        command: '::reboot',
        tier: 'administrator',
        syntax: '::reboot',
        description: 'Immediately reboots the game world for maintenance.',
        example: '::reboot'
    },
    {
        command: '::slowreboot',
        tier: 'administrator',
        syntax: '::slowreboot <seconds>',
        description: 'Reboots the game world after a countdown of the given number of seconds (defaults to 30 if omitted or invalid).',
        example: '::slowreboot 60'
    },
    {
        command: '::serverdrop',
        tier: 'administrator',
        syntax: '::serverdrop',
        description: 'Immediately disconnects your own client, useful for testing reconnection behavior.',
        example: '::serverdrop'
    },
    {
        command: '::teleother',
        tier: 'administrator',
        syntax: '::teleother <username>',
        description: 'Teleports the given player to your current location (the reverse direction of ::teleto).',
        example: '::teleother Zezima'
    },
    {
        command: '::setstat',
        tier: 'administrator',
        syntax: '::setstat <skill> <level>',
        description: 'Sets one of your skills to the given level directly, with no level-up message or animation.',
        example: '::setstat attack 99'
    },
    {
        command: '::advancestat',
        tier: 'administrator',
        syntax: '::advancestat <skill> <level>',
        description: 'Advances one of your skills up to the given level from its current level, playing the normal level-up messages and animation along the way.',
        example: '::advancestat attack 99'
    },
    {
        command: '::minme',
        tier: 'administrator',
        syntax: '::minme',
        description: 'Resets ALL of your skills to level 1 (Hitpoints to level 10, its minimum) and loses all of their XP - not just the single skill the name might suggest.',
        example: '::minme'
    },
    {
        command: '::locadd',
        tier: 'administrator',
        syntax: '::locadd <object name>',
        description: 'Spawns a temporary scenery object at your current location, which despawns automatically after a short time.',
        example: '::locadd banktable'
    },
    {
        command: '::npcadd',
        tier: 'administrator',
        syntax: '::npcadd <npc name>',
        description: 'Spawns a temporary NPC at your current location, which despawns automatically after a short time.',
        example: '::npcadd goblin'
    },
    {
        command: '::openmain',
        tier: 'administrator',
        syntax: '::openmain <interface name>',
        description: 'Opens the given interface as your main-screen modal (must be a root-layer interface).',
        example: '::openmain bank_main'
    },
    {
        command: '::openoverlay',
        tier: 'administrator',
        syntax: '::openoverlay <interface name>',
        description: 'Opens the given interface as a main-screen overlay - a persistent panel layered over the game view, rather than a modal (must be a root-layer interface).',
        example: '::openoverlay orbs'
    },
    {
        command: '::closeoverlay',
        tier: 'administrator',
        syntax: '::closeoverlay',
        description: 'Closes your currently open main-screen overlay.',
        example: '::closeoverlay'
    },
    {
        command: '::snapshot',
        tier: 'administrator',
        syntax: '::snapshot',
        description: 'Writes a V8 heap snapshot of the server process to disk, for diagnosing memory issues. Nothing is sent to you in-game.',
        example: '::snapshot'
    }
];
