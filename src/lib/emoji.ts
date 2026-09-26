// Curated emoji dataset for the picker + :shortcode: transformer.
// Format: [char, "name keywords"] — first keyword doubles as the shortcode.

export interface EmojiEntry {
  char: string
  name: string
  keywords: string[]
}

export interface EmojiCategory {
  id: string
  name: string
  icon: string
  emojis: EmojiEntry[]
}

const RAW: Array<[string, string, string, Array<[string, string]>]> = [
  ['smileys', 'Smileys & People', '😀', [
    ['😀', 'grinning smile happy'], ['😃', 'smiley happy joyful'], ['😄', 'smile_laugh happy'], ['😁', 'grin beam'],
    ['😆', 'laughing satisfied lol'], ['😅', 'sweat_smile nervous'], ['🤣', 'rofl lmao'], ['😂', 'joy tears laugh'],
    ['🙂', 'slightly_smiling_face'], ['🙃', 'upside_down silly'], ['😉', 'wink'], ['😊', 'blush happy warm'],
    ['😇', 'innocent halo angel'], ['🥰', 'smiling_face_with_hearts love'], ['😍', 'heart_eyes love'],
    ['🤩', 'star_struck wow amazing'], ['😘', 'kissing_heart kiss'], ['😗', 'kissing'],
    ['😋', 'yum tasty'], ['😜', 'stuck_out_tongue_winking_eye playful zany'], ['🤪', 'zany crazy wild'],
    ['🤨', 'raised_eyebrow really suspicious'], ['🧐', 'monocle inspect'], ['🤓', 'nerd geek glasses'],
    ['😎', 'sunglasses cool'], ['🥳', 'partying_face celebrate party'], ['😏', 'smirk'],
    ['😒', 'unamused meh'], ['🙄', 'rolling_eyes whatever'], ['😔', 'pensive sad'],
    ['😪', 'sleepy tired'], ['🤤', 'drooling_face'], ['😴', 'sleeping zzz'],
    ['🤯', 'exploding_head mind_blown'], ['🥱', 'yawning sleepy'], ['😔', 'pensive sad'],
    ['😭', 'sob crying loudly_crying'], ['😢', 'cry sad tear'], ['😱', 'scream shock'],
    ['🤬', 'cursing swear angry'], ['😡', 'rage angry mad'], ['🤔', 'thinking think hmm'],
    ['🤫', 'shushing_face quiet secret'], ['🤭', 'hand_over_mouth oops giggle'], ['😬', 'grimace awkward'],
    ['🥺', 'pleading puppy_eyes please'], ['😅', 'sweat_smile phew'], ['🫠', 'melting'],
    ['👻', 'ghost boo halloween'], ['💀', 'skull dead'], ['🤖', 'robot bot ai'],
    ['👽', 'alien ufo'], ['🤡', 'clown'], ['💩', 'poop'],
  ]],
  ['gestures', 'Gestures', '👋', [
    ['👋', 'wave hello hi bye'], ['🤚', 'raised_back_of_hand'], ['🖐️', 'hand fingers'],
    ['✋', 'raised_hand stop high_five'], ['🖖', 'spock vulcan'], ['👌', 'ok perfect'],
    ['🤌', 'pinched_fingers italian'], ['🤏', 'pinching_hand little'], ['✌️', 'victory peace'],
    ['🤞', 'crossed_fingers luck hope'], ['🤟', 'love_you'], ['🤘', 'rock_on horns'],
    ['🤙', 'call_me shaka'], ['👈', 'point_left'], ['👉', 'point_right'],
    ['👆', 'point_up'], ['👇', 'point_down'], ['☝️', 'point_up_one'],
    ['👍', 'thumbsup +1 yes approve like'], ['👎', 'thumbsdown -1 no disapprove'], ['✊', 'fist bump'],
    ['👊', 'punch fist_bump'], ['🤛', 'left_fist'], ['🤜', 'right_fist'],
    ['👏', 'clap applause bravo'], ['🙌', 'raised_hands hooray celebrate'], ['👐', 'open_hands'],
    ['🤲', 'palms_up'], ['🤝', 'handshake deal agreement'], ['🙏', 'pray thanks please namaste'],
    ['💪', 'muscle strong flex'], ['🫶', 'heart_hands love'], ['✍️', 'writing_hand'],
    ['🫡', 'salute yes_sir'], ['🤌', 'pinched'], ['👀', 'eyes look watch'],
  ]],
  ['hearts', 'Hearts', '❤️', [
    ['❤️', 'heart love red_heart'], ['🧡', 'orange_heart'], ['💛', 'yellow_heart'], ['💚', 'green_heart'],
    ['💜', 'purple_heart'], ['🖤', 'black_heart'], ['🤍', 'white_heart'], ['🤎', 'brown_heart'],
    ['💔', 'broken_heart sad'], ['❣️', 'heart_exclamation'], ['💕', 'two_hearts love'],
    ['💞', 'revolving_hearts'], ['💓', 'beating_heart'], ['💗', 'growing_heart'],
    ['💖', 'sparkling_heart'], ['💘', 'heart_arrow cupid'], ['💝', 'heart_gift ribbon'],
    ['💟', 'heart_decoration'], ['💌', 'love_letter'], ['💋', 'kiss lipstick'],
    ['🫶', 'heart_hands'], ['💐', 'bouquet flowers'], ['🌷', 'tulip'],
    ['🌹', 'rose'], ['🥀', 'wilted_rose'], ['🌸', 'cherry_blossom'],
    ['🌺', 'hibiscus'], ['🌻', 'sunflower'], ['🌼', 'blossom daisy'],
    ['✨', 'sparkles shine magic new'], ['💫', 'dizzy star'], ['⭐', 'star'],
    ['🌟', 'glowing_star'], ['⚡', 'zap lightning'], ['🔥', 'fire hot lit'],
    ['🌈', 'rainbow pride'], ['☀️', 'sunny sun'], ['🌙', 'moon crescent'],
  ]],
  ['animals', 'Animals & Nature', '🐳', [
    ['🐶', 'dog puppy'], ['🐱', 'cat kitten'], ['🐭', 'mouse'], ['🐹', 'hamster'],
    ['🐰', 'rabbit bunny'], ['🦊', 'fox'], ['🐻', 'bear'], ['🐼', 'panda'],
    ['🐨', 'koala'], ['🐯', 'tiger'], ['🦁', 'lion'], ['🐮', 'cow'],
    ['🐷', 'pig'], ['🐸', 'frog'], ['🐵', 'monkey_face'], ['🙈', 'see_no_evil monkey'],
    ['🙉', 'hear_no_evil'], ['🙊', 'speak_no_evil'], ['🐔', 'chicken'],
    ['🐧', 'penguin'], ['🐦', 'bird'], ['🐤', 'baby_chick'], ['🦆', 'duck'],
    ['🦅', 'eagle'], ['🦉', 'owl'], ['🦇', 'bat'], ['🐺', 'wolf'],
    ['🐴', 'horse'], ['🦄', 'unicorn'], ['🐝', 'bee'],
    ['🦋', 'butterfly'], ['🐌', 'snail'], ['🐞', 'ladybug beetle'],
    ['🐢', 'turtle'], ['🐍', 'snake'], ['🐙', 'octopus'],
    ['🦑', 'squid'], ['🦐', 'shrimp'], ['🐬', 'dolphin'],
    ['🐳', 'whale'], ['🦈', 'shark'], ['🐊', 'crocodile'],
    ['🐘', 'elephant'], ['🦒', 'giraffe'], ['🦘', 'kangaroo'],
  ]],
  ['food', 'Food & Drink', '🍕', [
    ['🍏', 'green_apple'], ['🍎', 'apple red_apple'], ['🍐', 'pear'], ['🍊', 'orange tangerine'],
    ['🍋', 'lemon'], ['🍌', 'banana'], ['🍉', 'watermelon'], ['🍇', 'grapes'],
    ['🍓', 'strawberry'], ['🫐', 'blueberries'], ['🍈', 'melon'], ['🍒', 'cherries'],
    ['🍑', 'peach'], ['🥭', 'mango'], ['🍍', 'pineapple'], ['🥥', 'coconut'],
    ['🥝', 'kiwi'], ['🍅', 'tomato'], ['🥑', 'avocado'], ['🥦', 'broccoli'],
    ['🥕', 'carrot'], ['🌽', 'corn'], ['🌶️', 'hot_pepper spicy'], ['🥔', 'potato'],
    ['🍞', 'bread'], ['🥐', 'croissant'], ['🥨', 'bagel pretzel'], ['🧀', 'cheese'],
    ['🥚', 'egg'], ['🍳', 'cooking egg_fried'], ['🥞', 'pancakes'], ['🥓', 'bacon'],
    ['🍔', 'hamburger burger'], ['🍟', 'fries'], ['🍕', 'pizza'], ['🌭', 'hotdog'],
    ['🥪', 'sandwich'], ['🌮', 'taco'], ['🌯', 'burrito'], ['🥗', 'salad'],
    ['🍝', 'spaghetti pasta'], ['🍜', 'ramen noodles'], ['🍣', 'sushi'],
    ['🍩', 'doughnut donut'], ['🍪', 'cookie'], ['🎂', 'birthday cake'],
    ['🧁', 'cupcake'], ['🍰', 'cake shortcake'], ['🍫', 'chocolate'],
    ['🍿', 'popcorn'], ['☕', 'coffee cafe'], ['🍵', 'tea green_tea'],
    ['🧋', 'boba bubble_tea'], ['🥤', 'soda cup_straw'], ['🍺', 'beer'],
    ['🍷', 'wine glass_wine'], ['🍸', 'cocktail martini'], ['🥂', 'champagne cheers toast'],
  ]],
  ['activities', 'Activities', '⚽', [
    ['⚽', 'soccer football'], ['🏀', 'basketball ball'], ['🏈', 'football american'], ['⚾', 'baseball'],
    ['🎾', 'tennis'], ['🏐', 'volleyball'], ['🎱', '8ball pool billiards'], ['🏓', 'ping_pong table_tennis'],
    ['🏸', 'badminton'], ['🏒', 'hockey'], ['⛳', 'golf'], ['🏹', 'bow_and_arrow archery'],
    ['🎣', 'fishing'], ['🥊', 'boxing glove'], ['🥋', 'martial_arts karate'], ['🛹', 'skateboard'],
    ['⛸️', 'ice_skate'], ['🎿', 'ski'], ['🏂', 'snowboard'], ['🪂', 'parachute skydive'],
    ['🏋️', 'weightlifting gym lift'], ['🧘', 'yoga meditate lotus'], ['🏄', 'surfing'],
    ['🏊', 'swimming'], ['🚴', 'biking cyclist'], ['🎪', 'circus tent'], ['🎭', 'performing_arts theater'],
    ['🎨', 'art palette paint creative'], ['🎬', 'clapper movie film'], ['🎤', 'microphone karaoke sing'],
    ['🎧', 'headphones music'], ['🎼', 'musical_score'], ['🎹', 'piano keyboard'],
    ['🥁', 'drum'], ['🎷', 'saxophone'], ['🎺', 'trumpet'],
    ['🎸', 'guitar'], ['🎻', 'violin'], ['🎲', 'dice game'],
    ['🎯', 'dart target bullseye'], ['🎳', 'bowling'], ['🎮', 'video_game gaming controller'],
    ['🕹️', 'joystick arcade'], ['🧩', 'puzzle piece'], ['🏆', 'trophy win champion'],
    ['🥇', 'gold_medal first'], ['🥈', 'silver_medal second'], ['🥉', 'bronze_medal third'],
  ]],
  ['objects', 'Objects', '💡', [
    ['⌚', 'watch'], ['📱', 'phone mobile'], ['💻', 'laptop computer work'], ['🖥️', 'desktop computer'],
    ['⌨️', 'keyboard'], ['🖨️', 'printer'], ['🖱️', 'mouse computer_mouse'], ['🕹️', 'joystick'],
    ['📷', 'camera photo'], ['📸', 'camera_flash photo'], ['📺', 'tv'], ['📻', 'radio'],
    ['⏰', 'alarm_clock'], ['⏳', 'hourglass time'], ['📡', 'satellite'], ['🔋', 'battery'],
    ['🔌', 'plug power'], ['💡', 'bulb idea light'], ['🔦', 'flashlight'], ['🕯️', 'candle'],
    ['🧯', 'fire_extinguisher'], ['💰', 'money_bag'], ['💳', 'credit_card'], ['💎', 'gem diamond'],
    ['⚖️', 'balance scale justice'], ['🧰', 'toolbox'], ['🔧', 'wrench fix'], ['🔨', 'hammer build'],
    ['🪛', 'screwdriver'], ['🔩', 'nut_and_bolt'], ['⚙️', 'gear settings'], ['🧱', 'brick'],
    ['🔗', 'link chain'], ['📎', 'paperclip attach'], ['📐', 'triangular_ruler'], ['📏', 'ruler'],
    ['📌', 'pushpin pin'], ['📍', 'round_pushpin location'], ['✂️', 'scissors cut'],
    ['🖊️', 'pen'], ['✏️', 'pencil write'], ['📝', 'memo note write'],
    ['📚', 'books library'], ['📖', 'book open_book'], ['🔖', 'bookmark'],
    ['🔍', 'search magnifying_glass'], ['🔒', 'lock secure private'], ['🔓', 'unlock open'],
    ['🛡️', 'shield security'], ['🚀', 'rocket ship launch ship'], ['🛎️', 'bellhop bell service'],
    ['🎁', 'gift present'], ['🎈', 'balloon party'], ['🎉', 'tada celebrate party congrats'],
    ['🎊', 'confetti_ball celebration'], ['🕹️', 'joystick arcade game'], ['🧲', 'magnet'],
  ]],
  ['symbols', 'Symbols', '✅', [
    ['✅', 'white_check_mark check yes done approve'], ['❌', 'x no cross wrong'], ['❓', 'question confused'],
    ['❗', 'exclamation important alert'], ['⚠️', 'warning caution'], ['💯', 'hundred perfect score'],
    ['♻️', 'recycle'], ['🔱', 'trident'], ['🔰', 'beginner japanese_beginner'], ['✳️', 'eight_spoked_asterisk'],
    ['🌐', 'globe_world earth worldwide'], ['📈', 'chart_up growing trend'], ['📉', 'chart_down declining'],
    ['📊', 'bar_chart analytics data'], ['📋', 'clipboard'], ['📅', 'calendar date'],
    ['🗓️', 'spiral_calendar schedule'], ['⏰', 'clock alarm'], ['🕓', 'clock4 time'],
    ['🔔', 'bell notification'], ['🔕', 'no_bell mute'], ['🎵', 'music_note'],
    ['➕', 'plus add'], ['➖', 'minus'], ['✖️', 'multiply'], ['➗', 'divide'],
    ['♾️', 'infinity'], ['‼️', 'double_exclamation'], ['⁉️', 'interrobang'],
    ['🔅', 'dim'], ['🔆', 'bright'], ['🔘', 'radio_button'], ['⚪', 'white_circle'],
    ['⚫', 'black_circle'], ['🟠', 'orange_circle'], ['🟢', 'green_circle ready online'],
    ['🟣', 'purple_circle'], ['🔴', 'red_circle recording error'], ['🟡', 'yellow_circle'],
    ['⭕', 'hollow_red_circle'], ['🚫', 'prohibited no_entry blocked'], ['⛔', 'no_entry'],
    ['💾', 'floppy_disk save'], ['🖥️', 'computer'], ['🗂️', 'folder files organized'],
    ['📄', 'page document file'], ['📂', 'open_folder'], ['🏷️', 'label tag'],
    ['🆗', 'ok button'], ['🆕', 'new'], ['🔝', 'top up'],
    ['🔜', 'soon'], ['✅', 'check'], ['❎', 'no_mark'],
  ]],
]

export const EMOJI_CATEGORIES: EmojiCategory[] = RAW.map(([id, name, icon, list]) => ({
  id,
  name,
  icon,
  emojis: list.map(([char, keywords]) => {
    const words = keywords.split(' ')
    return { char, name: words[0].replace(/_/g, ' '), keywords: words }
  }),
}))

const ALL = EMOJI_CATEGORIES.flatMap((c) => c.emojis)

const byShortcode = new Map<string, string>()
for (const emoji of ALL) {
  // name is the primary shortcode (e.g. "thumbsup")
  byShortcode.set(emoji.keywords[0].replace(/_/g, '_'), emoji.char)
}
// extras commonly used that map to existing chars
byShortcode.set('thumbsup', '👍')
byShortcode.set('ship', '🚀')
byShortcode.set('rocket', '🚀')
byShortcode.set('party', '🎉')
byShortcode.set('smile', '😄')
byShortcode.set('cry', '😢')
byShortcode.set('sob', '😭')
byShortcode.set('laugh', '😆')
byShortcode.set('wink', '😉')
byShortcode.set('ok_hand', '👌')
byShortcode.set('clap', '👏')
byShortcode.set('wave', '👋')
byShortcode.set('pray', '🙏')
byShortcode.set('bulb', '💡')
byShortcode.set('seedling', '🌱')
byShortcode.set('wilted_rose', '🥀')
byShortcode.set('traffic_light', '🚦')
byShortcode.set('slightly_smiling_face', '🙂')
byShortcode.set('sweat_smile', '😅')
byShortcode.set('upside_down_face', '🙃')
byShortcode.set('nerd_face', '🤓')
byShortcode.set('thinking_face', '🤔')
byShortcode.set('facepalm', '🤦')

/** :shortcode: → emoji char, or null when unknown. */
export function lookup(shortcode: string): string | null {
  return byShortcode.get(shortcode) ?? null
}

/** Replace all :shortcode: occurrences in a text with emoji chars. */
export function colonToEmoji(text: string): string {
  return text.replace(/:([a-zA-Z0-9_+-]{1,40}):/g, (match, code: string) => {
    const emoji = byShortcode.get(code)
    return emoji ?? match
  })
}

/** Search emojis by keyword / shortcode prefix. */
export function searchEmojis(query: string, limit = 60): EmojiEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const scored: Array<{ entry: EmojiEntry; score: number }> = []
  for (const emoji of ALL) {
    let best = Infinity
    for (const keyword of emoji.keywords) {
      if (keyword === q) best = Math.min(best, 0)
      else if (keyword.startsWith(q)) best = Math.min(best, 1)
      else if (keyword.includes(q)) best = Math.min(best, 2)
    }
    if (best < Infinity) scored.push({ entry: emoji, score: best })
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.entry)
}

const RECENT_KEY = 'flack-recent-emojis'
const RECENT_MAX = 24

export function getRecentEmojis(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const parsed = raw ? (JSON.parse(raw) as string[]) : []
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

export function pushRecentEmoji(char: string): void {
  try {
    const current = getRecentEmojis().filter((c) => c !== char)
    const next = [char, ...current].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // localStorage unavailable — ignore
  }
}
