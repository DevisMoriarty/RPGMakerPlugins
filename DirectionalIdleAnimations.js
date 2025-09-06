//=============================================================================
// DirectionalIdleAnimations.js
// by You (Adapted for RPG Maker MZ)
//=============================================================================

/*:
 * @plugindesc v1.1 Adds direction-aware idle animations with timing & probability control.
 * @author YourName
 *
 * @param DefaultMinIdleTime
 * @text Default Min Idle Time (sec)
 * @type number
 * @decimals 1
 * @min 0
 * @default 5.0
 *
 * @param DefaultMaxIdleTime
 * @text Default Max Idle Time (sec)
 * @type number
 * @decimals 1
 * @min 0
 * @default 10.0
 *
 * @param DefaultIdleProbability
 * @text Default Idle Probability (%)
 * @type number
 * @min 0
 * @max 100
 * @default 80
 *
 * @help
 * This plugin allows characters to play idle animations when standing still.
 * Idle animations respect the character's last facing direction.
 * Idle animations must be in same format as walking sheets (3x4).
 *
 * ▼ NOTETAGS (Place in Actor note or Event comment):
 *
 * <IdleAnim: filename, startPattern, endPattern, probability%>
 *   - filename: image in img/characters/ (e.g., "Actor1_Idle")
 *   - startPattern: starting horizontal frame (0, 1, or 2)
 *   - endPattern: ending horizontal frame (usually 2)
 *   - probability: optional (0-100), default = 100
 *
 * <IdleAnimMinTime: 3.0>
 * <IdleAnimMaxTime: 8.0>
 *
 * ▼ EXAMPLE:
 * <IdleAnim: Hero_IdleBlink, 0, 2, 70>
 * <IdleAnim: Hero_IdleStretch, 0, 2, 30>
 * <IdleAnimMinTime: 4.0>
 *
 * ▼ PLUGIN COMMAND (Event):
 * triggerIdle characterId
 *   - e.g., this._eventId for current event
 */

(() => {

    const params = PluginManager.parameters('DirectionalIdleAnimations');
    const DEFAULT_MIN_IDLE = parseFloat(params['DefaultMinIdleTime'] || 5.0);
    const DEFAULT_MAX_IDLE = parseFloat(params['DefaultMaxIdleTime'] || 10.0);
    const DEFAULT_PROB = parseFloat(params['DefaultIdleProbability'] || 80);

    //-----------------------------------------------------------------------------
    // Game_Character
    //

    const _Game_Character_initMembers = Game_Character.prototype.initMembers;
    Game_Character.prototype.initMembers = function() {
        _Game_Character_initMembers.call(this);
        this._idleAnimations = [];
        this._isIdling = false;
        this._idleTimer = 0;
        this._idleMinTime = DEFAULT_MIN_IDLE;
        this._idleMaxTime = DEFAULT_MAX_IDLE;
        this._currentIdleAnim = null;
        this._originalPattern = 0;
        this._originalCharacterName = "";
        this._idleFacingDirection = 2; // default down
    };

    Game_Character.prototype.setCharacterIdleData = function(idleAnims, minTime, maxTime) {
        this._idleAnimations = idleAnims || [];
        if (minTime !== undefined) this._idleMinTime = minTime;
        if (maxTime !== undefined) this._idleMaxTime = maxTime;
    };

    Game_Character.prototype.updateIdle = function() {
        if (this.isMoving() || this._waitCount > 0) {
            this._isIdling = false;
            this._idleTimer = 0;
            this._currentIdleAnim = null;
            return;
        }

        if (!this._isIdling) {
            this._idleTimer += 1/60; // assuming 60 FPS

            if (this._idleTimer >= this._idleMinTime) {
                let roll = Math.random() * 100;
                let maxTimeExceeded = this._idleTimer > this._idleMaxTime;

                if (maxTimeExceeded || roll < DEFAULT_PROB) {
                    this.startIdleAnimation();
                }
            }
        } else {
            if (this._currentIdleAnim) {
                this.updateIdleAnimationFrame();
            }
        }
    };

    Game_Character.prototype.startIdleAnimation = function() {
        if (this._idleAnimations.length === 0) return;

        // Weighted random selection
        let totalWeight = this._idleAnimations.reduce((sum, anim) => sum + (anim.probability || 100), 0);
        let rand = Math.random() * totalWeight;
        let chosenAnim = null;

        for (let anim of this._idleAnimations) {
            rand -= (anim.probability || 100);
            if (rand <= 0) {
                chosenAnim = anim;
                break;
            }
        }

        if (!chosenAnim) chosenAnim = this._idleAnimations[0]; // fallback

        this._isIdling = true;
        this._currentIdleAnim = chosenAnim;
        this._originalCharacterName = this._characterName;
        this._originalPattern = this._pattern;

        // Remember current direction for idle
        this._idleFacingDirection = this._direction;

        // Switch to idle character sheet
        this._characterName = chosenAnim.name;
        this._pattern = chosenAnim.startPattern;

        // Calculate total frames: (number of patterns) * 15 frames each
        this._idleFrameCount = 0;
        let patternCount = chosenAnim.endPattern - chosenAnim.startPattern + 1;
        this._idleAnimLength = patternCount * 15;
    };

    Game_Character.prototype.updateIdleAnimationFrame = function() {
        this._idleFrameCount++;

        if (this._idleFrameCount >= this._idleAnimLength) {
            // Revert to original
            this._characterName = this._originalCharacterName;
            this._pattern = this._originalPattern;
            this._isIdling = false;
            this._currentIdleAnim = null;
            this._idleTimer = 0;
            return;
        }

        // Update pattern index (loop within startPattern to endPattern)
        let patternCount = this._currentIdleAnim.endPattern - this._currentIdleAnim.startPattern + 1;
        let framePerPattern = 15;
        let patternIndex = Math.floor(this._idleFrameCount / framePerPattern) % patternCount;
        this._pattern = this._currentIdleAnim.startPattern + patternIndex;

        // Force direction to match original facing (so idle anim faces correct way)
        this._direction = this._idleFacingDirection;
    };

    const _Game_Character_update = Game_Character.prototype.update;
    Game_Character.prototype.update = function() {
        _Game_Character_update.call(this);
        this.updateIdle();
    };

    //-----------------------------------------------------------------------------
    // Notetag Parsing
    //

    Game_Character.prototype.loadIdleNotetags = function(note) {
        if (!note) return;

        let idleAnims = [];
        let minTime, maxTime;

        const lines = note.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (line.match(/<IdleAnimMinTime:\s*([0-9.]+)>/i)) {
                minTime = parseFloat(RegExp.$1);
            } else if (line.match(/<IdleAnimMaxTime:\s*([0-9.]+)>/i)) {
                maxTime = parseFloat(RegExp.$1);
            } else if (line.match(/<IdleAnim:\s*([^,]+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?/i)) {
                let name = RegExp.$1.trim();
                let start = parseInt(RegExp.$2);
                let end = parseInt(RegExp.$3);
                let prob = parseInt(RegExp.$4) || 100;
                idleAnims.push({ name, startPattern: start, endPattern: end, probability: prob });
            }
        }

        this.setCharacterIdleData(idleAnims, minTime, maxTime);
    };

    //-----------------------------------------------------------------------------
    // Game_Actor
    //

    const _Game_Actor_setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        _Game_Actor_setup.call(this, actorId);
        const actor = $dataActors[actorId];
        if (actor && actor.note) {
            this.loadIdleNotetags(actor.note);
        }
    };

    //-----------------------------------------------------------------------------
    // Game_Event
    //

    const _Game_Event_setupPageSettings = Game_Event.prototype.setupPageSettings;
    Game_Event.prototype.setupPageSettings = function() {
        _Game_Event_setupPageSettings.call(this);
        if (this.page() && this.page().list) {
            for (let cmd of this.page().list) {
                if (cmd.code === 108 || cmd.code === 408) { // Comment
                    this.loadIdleNotetags(cmd.parameters[0]);
                }
            }
        }
    };

    //-----------------------------------------------------------------------------
    // Sprite_Character (Optional: Force refresh on character name change)
    //

    const _Sprite_Character_updateBitmap = Sprite_Character.prototype.updateBitmap;
    Sprite_Character.prototype.updateBitmap = function() {
        if (this._character && this._characterName !== this._character.characterName()) {
            this._prevCharacterName = this._characterName;
            this._prevCharacterIndex = this._characterIndex;
        }
        _Sprite_Character_updateBitmap.call(this);
    };

    //-----------------------------------------------------------------------------
    // Plugin Command
    //

    PluginManager.registerCommand('DirectionalIdleAnimations', 'triggerIdle', args => {
        const characterId = parseInt(args.characterId);
        const character = $gameMap.character(characterId);
        if (character && !character.isMoving() && !character._isIdling) {
            character.startIdleAnimation();
        }
    });

})();
