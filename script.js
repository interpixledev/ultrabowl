var teams = {
    "AFC North": [
        "Baltimore",
        "Cleveland",
        "Pittsburgh",
        "Cincinnati"
    ],
    "AFC East": [
        "Buffalo",
        "Miami",
        "New England",
        "New York J"
    ],
    "AFC South": [
        "Houston",
        "Indianapolis",
        "Jacksonville",
        "Tennessee"
    ],
    "AFC West": [
        "Denver",
        "Kansas City",
        "Los Angeles C",
        "Las Vegas"
    ],
    "NFC North": [
        "Chicago",
        "Detroit",
        "Green Bay",
        "Minnesota"
    ],
    "NFC East": [
        "Dallas",
        "New York G",
        "Philadelphia",
        "Washington"
    ],
    "NFC South": [
        "Atlanta",
        "Carolina",
        "New Orleans",
        "Tampa Bay"
    ],
    "NFC West": [
        "Arizona",
        "Los Angeles R",
        "San Francisco",
        "Seattle"
    ],
}
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
function randrange(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
function roundToHalf(num) {
    return Math.round(num * 2) / 2;
}

var statmaps = [
    "games_played",
    "games_started",
    "completions",
    "attempts",
    "passing_yards",
    "passing_touchdowns",
    "passing_interceptions",
    "rushing_attempts",
    "rushing_yards",
    "rushing_touchdowns",
    "receiving_targets",
    "receptions",
    "receiving_yards",
    "receiving_touchdowns",
    "fumbles",
    "fumbles_lost",
    "tackles_solo",
    "tackles_assist",
    "sacks",
    "tackles_for_loss",
    "qb_hits",
    "forced_fumbles",
    "fumble_recoveries",
    "interceptions",
    "interception_return_yards",
    "interception_touchdowns",
    "passes_defended",
]
class Player {
    constructor() {
        this.name = "";
        this.position = "";
        this.unit = "";
        this.age = 0;

        this.awards = [];

        this.contract_years_left = 0;   // years remaining on current contract
        this.contract_salary = 0;       // annual salary in millions
        this.contract_type = "veteran"; // "rookie" | "veteran"
        this.team = null;

        this.strength = 0;
        this.speed = 0;
        this.stamina = 0;

        this.accuracy = 0; // QB, K
        this.tackling = 0; // DEF
        this.catching = 0; // WR, RB, TE
        this.blocking = 0; // OL

        this.draftRound = 0;   // which round they were drafted
        this.draftPick = 0;    // pick number overall

        this.stats = {
            games_played: 0,
            games_started: 0,
            completions: 0,
            attempts: 0,
            passing_yards: 0,
            passing_touchdowns: 0,
            passing_interceptions: 0,
            rushing_attempts: 0,
            rushing_yards: 0,
            rushing_touchdowns: 0,
            receiving_targets: 0,
            receptions: 0,
            receiving_yards: 0,
            receiving_touchdowns: 0,
            fumbles: 0,
            fumbles_lost: 0,
            tackles_solo: 0,
            sacks: 0,
            interceptions: 0,
            fgs: 0,
            week: [],
        };

        this.fpts = 0;

        // ── Morale & Loyalty ──────────────────────────────────────────
        this.morale = 75;           // 0-100; affects contract ask & demands
        this.seasonsWithTeam = 0;   // increments each season end
        this.demandPending = null;  // null | "trade" | "start"
        this.demandWeek = -1;       // week the demand was triggered
        this.isStarter = true;      // whether we've designated them as a starter
    }

    overall() {
        var pos = this.position;
        var posstat = 0;
        if (pos == "QB" || pos == "K") posstat = this.accuracy;
        if (pos == "DL" || pos == "LB" || pos == "DB") posstat = this.tackling;
        if (pos == "WR" || pos == "RB" || pos == "TE") posstat = this.catching;
        if (pos == "OL") posstat = this.blocking;
        return roundToHalf((this.strength + this.speed + this.stamina + posstat) / 4);
    }

    posStat() {
        var pos = this.position;
        var posstat = 0;
        var posstat_txt = "";
        if (pos == "QB" || pos == "K") {
            posstat = this.accuracy;
            posstat_txt = pos == "QB" ? "Throw Accuracy" : "Kick Accuracy";
        }
        if (pos == "DL" || pos == "LB" || pos == "DB") { posstat = this.tackling; posstat_txt = "Tackling"; }
        if (pos == "WR" || pos == "RB" || pos == "TE") { posstat = this.catching; posstat_txt = "Catching"; }
        if (pos == "OL") { posstat = this.blocking; posstat_txt = "Blocking"; }
        return [posstat, posstat_txt];
    }
}

class Team {
    constructor() {
        this.name = "";
        this.players = [];
        this.division = "";
        this.conference = "";
        this.playerTeam = false;

        this.offense_base = 2.5;
        this.defense_base = 2.5;

        this.wins = 0;
        this.losses = 0;
        this.ties = 0;

        this.pf = 0;
        this.pa = 0;

        // Draft picks: array of { round, pick } objects
        // Populated at start of each season based on standings
        this.draftPicks = [];
    }

    // ─── REVISED RATING SYSTEM ───────────────────────────────────────
    // Instead of averaging real players with filler slots (which dragged
    // ratings DOWN when adding weak-but-real players), we now use a
    // slot-based additive model.
    //
    // For each positional slot (e.g. QB ×1, WR ×2 …):
    //   • Filled slot  → contributes that player's overall (min 1)
    //   • Empty slot   → contributes offense_base (the team's "filler" quality)
    //
    // The final rating is the MEAN of all slot contributions, so the
    // scale stays on the same 1-10 range as before, but a 1-star rookie
    // always beats an empty slot because offense_base ≈ 1-3.
    // ─────────────────────────────────────────────────────────────────

    offenseRating() {
        // K excluded — kickers don't influence team rating
        const slots = [
            ["QB", 1],
            ["RB", 1],
            ["WR", 2],
            ["TE", 1],
            ["OL", 3],
        ];
        return this._slotRating(slots, "offense", this.offense_base);
    }

    defenseRating() {
        const slots = [
            ["DL", 2],
            ["LB", 2],
            ["DB", 2],
        ];
        return this._slotRating(slots, "defense", this.defense_base);
    }

    // Core of the new slot-based rating.
    // For every positional slot we pick the best available player at
    // that position; leftover players beyond the slot count are ignored
    // (they don't hurt or help the rating directly).
    _slotRating(slotDef, unit, base) {
        let total = 0;
        let slotCount = 0;

        for (const [pos, count] of slotDef) {
            // Gather players at this position, sorted best-first
            const atPos = this.players
                .filter(p => p.position === pos)
                .sort((a, b) => b.overall() - a.overall());

            for (let i = 0; i < count; i++) {
                if (i < atPos.length) {
                    // Real player — always at least 1 so they beat an empty slot
                    total += Math.max(1, atPos[i].overall());
                } else {
                    // Empty slot — use the team's base filler quality
                    total += base;
                }
                slotCount++;
            }
        }

        return roundToHalf(total / slotCount);
    }

    overallRating() {
        return roundToHalf((this.offenseRating() + this.defenseRating()) / 2);
    }

    sortedPlayers() {
        return this.players.sort((a, b) => {
            if (a.unit != b.unit) {
                if (a.unit == "offense") return -1;
                if (b.unit == "offense") return 1;
            }
            if (a.position != b.position) {
                const order = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K"];
                return order.indexOf(a.position) - order.indexOf(b.position);
            }
            return b.overall() - a.overall();
        });
    }

    offenseDepth() {
        // K excluded — kickers don't count toward depth score
        const requirements = [
            { position: "QB", label: "Quarterback", min: 1, ideal: 1 },
            { position: "RB", label: "Running Back", min: 1, ideal: 1 },
            { position: "WR", label: "Wide Receiver", min: 1, ideal: 2 },
            { position: "TE", label: "Tight End", min: 1, ideal: 2 },
            { position: "OL", label: "Offensive Line", min: 1, ideal: 3 },
        ];
        return this._evalDepth(requirements);
    }

    defenseDepth() {
        const requirements = [
            { position: "DL", label: "Defensive Line", min: 1, ideal: 2 },
            { position: "LB", label: "Linebacker", min: 1, ideal: 2 },
            { position: "DB", label: "Defensive Back", min: 1, ideal: 2 },
        ];
        return this._evalDepth(requirements);
    }

    rosterDepth() {
        const offense = this.offenseDepth();
        const defense = this.defenseDepth();
        const all = [...offense.positions, ...defense.positions];
        const total = all.reduce((sum, p) => sum + p.score, 0);
        const score = roundToHalf(total / all.length);
        return { score };
    }

    _evalDepth(requirements) {
        const positions = [];
        for (const req of requirements) {
            const count = this.players.filter(p => p.position === req.position).length;
            let score;
            if (count === 0) score = 0;
            else if (count < req.min) score = roundToHalf((count / req.min) * 4);
            else if (count < req.ideal) score = roundToHalf(4 + ((count - req.min) / (req.ideal - req.min)) * 5);
            else score = 10;

            let status;
            if (score === 0) status = "missing";
            else if (score <= 4) status = "thin";
            else if (score <= 7) status = "adequate";
            else status = "solid";

            positions.push({ position: req.position, label: req.label, count, min: req.min, ideal: req.ideal, score, status });
        }
        const total = positions.reduce((sum, p) => sum + p.score, 0);
        const score = roundToHalf(total / positions.length);
        let status;
        if (score >= 9) status = "Elite";
        else if (score >= 7) status = "Solid";
        else if (score >= 5) status = "Average";
        else if (score >= 3) status = "Thin";
        else status = "Barren";
        return { score, status, positions };
    }

    // ─── CPU ROSTER MANAGEMENT ───────────────────────────────────────
    // Cut the single worst surplus player from this team, respecting
    // minimum position requirements.  Returns true if a player was cut.
    cpuCutWorstSurplus() {
        // Minimum we must keep at each position
        const minimums = { QB:1, K:1, RB:1, WR:1, TE:1, OL:2, DL:1, LB:1, DB:1 };

        let worst = null;
        let worstScore = Infinity;

        for (const p of this.players) {
            const pos = p.position;
            const posCount = this.players.filter(x => x.position === pos).length;
            const min = minimums[pos] ?? 1;
            // Only consider cutting if we have more than the minimum
            if (posCount <= min) continue;
            const score = p.overall();
            if (score < worstScore) { worstScore = score; worst = p; }
        }

        if (!worst) return false;
        this.players.splice(this.players.indexOf(worst), 1);
        return true;
    }

    // How many "surplus" players does this team have beyond all ideal counts?
    surplusCount() {
        const ideals = { QB:1, K:1, RB:1, WR:2, TE:2, OL:3, DL:2, LB:2, DB:2 };
        let surplus = 0;
        for (const [pos, ideal] of Object.entries(ideals)) {
            const count = this.players.filter(p => p.position === pos).length;
            surplus += Math.max(0, count - ideal);
        }
        return surplus;
    }
}

function getUnit(pos) {
    if (pos == "QB" || pos == "K" || pos == "WR" || pos == "RB" || pos == "TE" || pos == "OL") return "offense";
    return "defense";
}

function generateName() {
    var firsts = [
        "James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph", "Thomas", "Charles",
        "Christopher", "Daniel", "Matthew", "Anthony", "Mark", "Donald", "Steven", "Paul", "Andrew", "Joshua",
        "Kenneth", "Kevin", "Brian", "George", "Timothy", "Ronald", "Edward", "Jason", "Jeffrey", "Ryan",
        "Jacob", "Gary", "Nicholas", "Eric", "Jonathan", "Stephen", "Larry", "Justin", "Scott", "Brandon",
        "Benjamin", "Samuel", "Raymond", "Gregory", "Frank", "Alexander", "Patrick", "Jack", "Dennis", "Jerry",
        "Tyler", "Aaron", "Jose", "Adam", "Nathan", "Henry", "Douglas", "Zachary", "Peter", "Kyle",
        "Walter", "Ethan", "Jeremy", "Harold", "Terry", "Sean", "Austin", "Gerald", "Carl", "Arthur",
        "Lawrence", "Dylan", "Jesse", "Jordan", "Bryan", "Billy", "Joe", "Bruce", "Gabriel", "Logan",
        "Albert", "Willie", "Alan", "Juan", "Wayne", "Elijah", "Randy", "Roy", "Vincent", "Ralph",
        "Eugene", "Russell", "Bobby", "Mason", "Philip", "Louis", "Bobby", "Johnny", "Carlos", "Chris",
        "Caleb", "Evan", "Shawn", "Clarence", "Liam", "Noah", "Oliver", "Aiden", "Lucas", "Caden",
        "Owen", "Wyatt", "Hunter", "Leo", "Isaiah", "Nolan", "Xavier", "Eli", "Brayden", "Connor",
        "Landon", "Adrian", "Dominic", "Colton", "Carson", "Jaxon", "Tristan", "Cooper", "Blake", "Cole",
        "Bentley", "Bryson", "Damian", "Easton", "Grayson", "Griffin", "Harrison", "Hayes", "Hudson", "Jace",
        "Jaden", "Jake", "Jasper", "Jax", "Jayden", "Jensen", "Jonah", "Julian",
        "Kayden", "Keegan", "Kellen", "Knox", "Lane", "Levi", "Lincoln", "Luca", "Malachi", "Marcus",
        "Maxwell", "Miles", "Miller", "Mitchell", "Morgan", "Myles", "Nash", "Nelson", "Omar", "Oscar",
        "Parker", "Paxton", "Preston", "Quinn", "Reed", "Reid", "Remington", "Rhett", "Ryder", "Sawyer",
        "Seth", "Silas", "Skyler", "Spencer", "Sterling", "Stone", "Sullivan", "Tanner",
        "Tate", "Theo", "Travis", "Trevor", "Troy", "Tucker", "Turner", "Victor", "Wade", "Warren",
        "Wesley", "Weston", "Wilder", "Will", "Winston", "Xander", "Zane", "Zion", "Zach",
        "Ace", "Ajax", "Alec", "Aldo", "Alonso", "Andre", "Angelo", "Archer", "Ari", "Armando",
        "Asher", "Atlas", "Atticus", "Axel", "Ayden", "Barrett", "Beckett", "Bennett",
        "Bishop", "Blaine", "Bodhi", "Brady", "Bram", "Brendan", "Brett", "Brock", "Brooks", "Bruno",
        "Buck", "Cade", "Cam", "Cameron", "Campbell", "Case", "Casey", "Cash", "Cason",
        "Cayden", "Chad", "Chance", "Chase", "Chip", "Clark", "Clay",
        "Clayton", "Cody", "Colin", "Collin", "Corey", "Craig",
        "Cruz", "Cyrus", "Dakota", "Dale", "Dallas", "Dalton", "Dante", "Darius", "Dash", "Davis",
        "Dawson", "Dax", "Dean", "Declan", "Derek", "Desmond", "Devin", "Devon", "Dexter",
        "Diego", "Drake", "Drew", "Duke", "Duncan", "Dustin", "Dwayne", "Eddie", "Edgar",
        "Eduardo", "Edwin", "Emilio", "Emmett", "Enrique", "Enzo", "Ezra",
        "Fabian", "Felipe", "Felix", "Fernando", "Finn", "Fletcher", "Flynn", "Ford", "Forest",
        "Foster", "Fox", "Francisco", "Franco", "Frankie", "Fred", "Frederick", "Garrett", "Gavin",
        "Gibson", "Glen", "Gordon", "Grady", "Graham", "Grant", "Gunner",
        "Hank", "Harley", "Harvey", "Heath", "Hector", "Henrik", "Holden",
        "Howard", "Hugh", "Hugo", "Ian", "Ivan", "Jagger",
        "Jameson", "Javier", "Jay", "Jed", "Jeff", "Jerome", "Jett", "Jim",
        "Jimmy", "Joel", "Jonas", "Jorge", "Jules", "Julius", "Kai", "Kane",
        "Karl", "Keaton", "Keith", "Kellan", "Kent", "Kieran",
        "Kit", "Kobe", "Kurt", "Kyler", "Lance", "Lars",
        "Lee", "Leon", "Leonard", "Leroy", "Lewis", "Lloyd", "Lorenzo", "Lou",
        "Luis", "Luther", "Maddox", "Malik", "Manuel", "Mario", "Martin", "Marvin", "Matt"
    ];

    var lasts = [
        "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
        "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
        "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
        "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
        "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts",
        "Turner", "Phillips", "Evans", "Parker", "Edwards", "Collins", "Stewart", "Morris", "Rogers",
        "Reed", "Cook", "Morgan", "Bell", "Murphy", "Bailey", "Cooper", "Richardson", "Cox", "Howard",
        "Ward", "Peterson", "Gray", "James", "Watson", "Brooks", "Kelly", "Sanders",
        "Price", "Bennett", "Wood", "Barnes", "Ross", "Henderson", "Coleman", "Jenkins", "Perry", "Powell",
        "Long", "Patterson", "Hughes", "Washington", "Butler", "Simmons", "Foster", "Gonzales", "Bryant",
        "Alexander", "Russell", "Griffin", "Diaz", "Hayes", "Myers", "Ford", "Hamilton", "Graham", "Sullivan",
        "Wallace", "Woods", "Cole", "West", "Jordan", "Owens", "Reynolds", "Fisher", "Ellis", "Harrison",
        "Gibson", "McDonald", "Cruz", "Marshall", "Ortiz", "Gomez", "Murray", "Freeman", "Wells", "Webb",
        "Simpson", "Stevens", "Tucker", "Porter", "Hunter", "Hicks", "Crawford", "Henry", "Boyd", "Mason",
        "Morales", "Kennedy", "Warren", "Dixon", "Ramos", "Reyes", "Burns", "Gordon", "Shaw", "Holmes",
        "Rice", "Robertson", "Hunt", "Black", "Daniels", "Palmer", "Mills", "Nichols", "Grant", "Knight",
        "Ferguson", "Rose", "Stone", "Hawkins", "Dunn", "Perkins", "Hudson", "Spencer", "Gardner", "Stephens",
        "Payne", "Pierce", "Berry", "Matthews", "Arnold", "Wagner", "Willis", "Ray", "Watkins", "Olson",
        "Carroll", "Duncan", "Snyder", "Hart", "Cunningham", "Bradley", "Lane", "Andrews", "Ruiz", "Harper",
        "Fox", "Riley", "Armstrong", "Carpenter", "Weaver", "Greene", "Lawrence", "Elliott", "Chavez", "Sims",
        "Austin", "Peters", "Kelley", "Franklin", "Lawson", "Fields", "Gutierrez", "Ryan", "Schmidt", "Carr",
        "Vasquez", "Castillo", "Wheeler", "Chapman", "Oliver", "Montgomery", "Richards", "Williamson", "Johnston", "Banks",
        "Meyer", "Bishop", "McCoy", "Howell", "Alvarez", "Morrison", "Hansen", "Fernandez", "Garza", "Harvey",
        "Little", "Burton", "Stanley", "George", "Jacobs", "Reid", "Kim", "Fuller", "Lynch",
        "Dean", "Gilbert", "Garrett", "Romero", "Welch", "Larson", "Frazier", "Burke", "Hanson", "Day",
        "Mendoza", "Moreno", "Bowman", "Medina", "Fowler", "Brewer", "Hoffman", "Carlson", "Silva", "Pearson",
        "Holland", "Douglas", "Fleming", "Jensen", "Vargas", "Byrd", "Davidson", "Hopkins", "May", "Terry",
        "Herrera", "Wade", "Soto", "Walters", "Curtis", "Neal", "Caldwell", "Lowe", "Jennings", "Barnett",
        "Graves", "Jimenez", "Horton", "Shelton", "Barrett", "Obrien", "Castro", "Sutton", "Gregory", "McKinney",
        "Lucas", "Miles", "Craig", "Chambers", "Holt", "Lambert", "Fletcher", "Watts", "Bates",
        "Hale", "Rhodes", "Pena", "Beck", "Newman", "Haynes", "McDaniel", "Mendez", "Bush", "Vaughn",
        "Parks", "Dawson", "Santiago", "Norris", "Hardy", "Love", "Steele", "Curry", "Powers", "Schultz",
        "Barker", "Guzman", "Page", "Munoz", "Ball", "Keller", "Chandler", "Weber", "Leonard", "Walsh",
        "Lyons", "Ramsey", "Wolfe", "Schneider", "Mullins", "Benson", "Sharp", "Bowen", "Daniel", "Barber",
        "Flowers", "Robles", "Haley", "Cannon", "Warner", "Strickland", "Melton", "Harmon", "Wolf",
        "Walton", "Mann", "McGee", "Farmer", "Hines", "Gallagher", "Hubbard", "Miranda",
        "Blair", "Alvarado", "Francis", "Gould", "Lamb", "Bowers", "Bradford", "Stokes", "Gentry",
        "Whitfield", "Bullock", "Patrick", "Faulkner", "Lara", "Gillespie", "Mora", "Christensen", "Terrell", "Colon",
        "Mack", "Blanchard", "Mejia", "Acosta", "Brandt", "Malone", "Odonnell", "Stafford", "Spence",
        "Mcbride", "Mcclain", "Mccormick", "Mccullough", "Mcdonald", "Mcfarland", "Mcintyre", "Mckenzie", "Mckinney",
        "Mcmillan", "Meadows", "Melendez", "Mercer", "Merritt", "Middleton", "Miranda",
        "Moody", "Moon", "Moran", "Morin", "Morton", "Mosley", "Mueller", "Mullen", "Murillo",
        "Nolan", "Norman", "Norris", "Norton", "Nunez", "Ochoa", "Oconnor", "Odom", "Oneal", "Orr",
        "Osborn", "Owens", "Pacheco", "Padilla", "Park", "Patton", "Penn", "Peralta",
        "Pittman", "Ponce", "Pope", "Potts", "Proctor", "Pruitt", "Quinn", "Quintero", "Randall", "Randolph",
        "Rangel", "Reeves", "Rios", "Rivas", "Robbins", "Roberson", "Rocha", "Rodgers", "Roman", "Rosa",
        "Rosario", "Rowe", "Roy", "Rush", "Salas", "Salazar", "Salinas", "Sandoval", "Saunders",
        "Serrano", "Shannon", "Shields", "Sloan", "Small", "Sparks", "Swanson", "Tanner", "Tapia"
    ];
    return firsts[randrange(0, firsts.length - 1)] + " " + lasts[randrange(0, lasts.length - 1)];
}

var allteams = [];

function ratg() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    let mean = 5;
    let stdDev = 1.8;
    let rating = mean + num * stdDev;
    if (rating > 8) rating = 8 + (rating - 8) * 0.5;
    rating = Math.max(1, Math.min(10, rating));
    return Math.round(rating);
}

// Generate a stat in a given range with gaussian noise
function ratgInRange(min, max) {
    let val;
    const mid = (min + max) / 2;
    const range = (max - min) / 2;
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    val = mid + num * (range * 0.45);
    val = Math.max(min, Math.min(max, val));
    return Math.round(val);
}

function logWeek(txt) {
    var wk = document.getElementById("week");
    wk.innerHTML = txt;
}

function toStars(num) {
    const rating = num / 2;
    const fullStars = Math.floor(rating);
    const hasHalf = (rating % 1) >= 0.5;
    return "★".repeat(fullStars) + (hasHalf ? "⯨" : "");
}

function renderDivisionBoxes() {
    var ddv = document.getElementById("division");
    document.getElementById("afc").innerHTML = "";
    document.getElementById("nfc").innerHTML = "";

    var divisionMap = {};
    for (var i = 0; i < allteams.length; i++) {
        var team = allteams[i];
        if (!divisionMap[team.division]) divisionMap[team.division] = [];
        divisionMap[team.division].push(team);
    }

    for (var division in divisionMap) {
        var divTeams = divisionMap[division].slice().sort(function (a, b) {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return a.losses - b.losses;
        });

        var htm = "";
        for (var j = 0; j < divTeams.length; j++) {
            var t = divTeams[j];
            htm += t.name + " " + t.wins + "-" + t.losses + "<br>";
        }

        var divisionbox = document.createElement("div");
        divisionbox.innerHTML = division + "<br>" + htm;
        divisionbox.classList.add("divisionbox");

        if (division.startsWith("AFC")) document.getElementById("afc").appendChild(divisionbox);
        else if (division.startsWith("NFC")) document.getElementById("nfc").appendChild(divisionbox);
    }

    const playerTeam = allteams.find(t => t.playerTeam);
    if (playerTeam && ddv) {
        const playerDivision = playerTeam.division;
        const divTeams = divisionMap[playerDivision].slice().sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return a.losses - b.losses;
        });
        let htm = `<div class="pdivision-title">${playerDivision}</div>`;
        for (const t of divTeams) {
            const isPlayer = t.playerTeam;
            htm += `
            <div class="pdivision-row${isPlayer ? ' pdivision-row--player' : ''}">
                <span class="pdivision-name">${t.name}</span>
                <span class="pdivision-record">
                    <span class="pdivision-wins">${t.wins}</span>
                    <span class="pdivision-sep">-</span>
                    <span class="pdivision-losses">${t.losses}</span>
                </span>
            </div>`;
        }
        ddv.innerHTML = `<div class="pdivision">${htm}</div>`;
    }
}

function generateLeague() {
    document.getElementById("gen").style.display = "none";
    var numplayers = 0;
    for (var division in teams) {
        for (let i = 0; i < teams[division].length; i++) {
            var team = new Team();
            team.name = teams[division][i];
            team.division = division;
            team.conference = division.startsWith("AFC") ? "afc" : "nfc";
            team.wins = 0;
            team.offense_base = randrange(1, 6) / 2;
            team.defense_base = randrange(1, 6) / 2;

            var positions = ["RB", "WR", "WR", "TE", "TE", "OL", "OL", "OL", "DL", "DL", "DL", "LB", "LB", "LB", "DB", "DB", "DB"];
            var selectedPositions = ["QB", "K"];
            for (let j = 0; j < randrange(6, 10); j++) {
                var indx = randrange(0, positions.length - 1);
                selectedPositions.push(positions[indx]);
                positions.splice(indx, 1);
            }

            for (let j = 0; j < selectedPositions.length; j++) {
                var player = new Player();
                player.name = generateName();
                player.position = selectedPositions[j];
                player.unit = getUnit(player.position);
                player.age = randrange(22, 28);
                player.contract_length = randrange(1, 4);

                player.strength = ratg();
                player.speed = ratg();
                player.stamina = ratg();
                player.accuracy = ratg();
                player.tackling = ratg();
                player.catching = ratg();
                player.blocking = ratg();

                player.contract_value = 0;
                numplayers++;

                player.team = team;
                team.players.push(player);
            }
            allteams.push(team);
        }
        renderDivisionBoxes();
    }

    var num5star = Math.floor(numplayers * 0.01);
    var num45star = Math.floor(numplayers * 0.025);
    var num4star = Math.floor(numplayers * 0.05);

    for (var i = 0; i < num5star; i++) {
        var team = allteams[randrange(0, allteams.length - 1)];
        var player = team.players[randrange(0, team.players.length - 1)];
        player.strength = 10; player.speed = 10; player.stamina = 10;
        player.accuracy = 10; player.tackling = 10; player.catching = 10; player.blocking = 10;
    }
    for (var i = 0; i < num45star; i++) {
        var team = allteams[randrange(0, allteams.length - 1)];
        var player = team.players[randrange(0, team.players.length - 1)];
        player.strength = randrange(8, 10); player.speed = randrange(8, 10); player.stamina = randrange(8, 10);
        player.accuracy = randrange(8, 10); player.tackling = randrange(8, 10); player.catching = randrange(8, 10); player.blocking = randrange(8, 10);
    }
    for (var i = 0; i < num4star; i++) {
        var team = allteams[randrange(0, allteams.length - 1)];
        var player = team.players[randrange(0, team.players.length - 1)];
        player.strength = randrange(7, 9); player.speed = randrange(7, 9); player.stamina = randrange(7, 9);
        player.accuracy = randrange(7, 9); player.tackling = randrange(7, 9); player.catching = randrange(7, 9); player.blocking = randrange(7, 9);
    }

    for (var t in allteams) {
        var d = document.createElement("div");
        d.innerHTML = allteams[t].name
            + " OFF:" + toStars(allteams[t].offenseRating())
            + " DEF:" + toStars(allteams[t].defenseRating())
            + "<br>";
        for (var p in allteams[t].sortedPlayers()) {
            var pl = allteams[t].sortedPlayers()[p];
            d.innerHTML += pl.name + " " + pl.position + " " + toStars(pl.overall()) + "<br>";
        }
        d.innerHTML += "<br>";
        document.getElementById("teamslist").appendChild(d);
    }

    var sel = document.getElementById("teamselect");
    for (let i = 0; i < allteams.length; i++) {
        var opt = document.createElement("option");
        opt.value = i;
        opt.innerHTML = allteams[i].name;
        sel.appendChild(opt);
    }
    sel.dispatchEvent(new Event("change", { bubbles: true }));
}

const statLabels = {
    games_played: "GP", games_started: "GS",
    completions: "CMP", attempts: "ATT",
    passing_yards: "PYDS", passing_touchdowns: "PTDS", passing_interceptions: "INTS",
    rushing_attempts: "RATT", rushing_yards: "RYDS", rushing_touchdowns: "RTDS",
    receiving_targets: "TGTS", receptions: "RECS", receiving_yards: "RYDS", receiving_touchdowns: "RTDS",
    fumbles: "FUMS", fumbles_lost: "FUML",
    tackles_solo: "TCKS", sacks: "SCKS", interceptions: "INTS", fgs: "FGS"
};

function statLabel(key) { return statLabels[key] || key; }

function renderSeasonStats(player) {
    var seasonstats = {
        games_played: 0, games_started: 0,
        completions: 0, attempts: 0, passing_yards: 0, passing_touchdowns: 0, passing_interceptions: 0,
        rushing_attempts: 0, rushing_yards: 0, rushing_touchdowns: 0,
        receptions: 0, receiving_targets: 0, receiving_yards: 0, receiving_touchdowns: 0,
        fumbles: 0, fumbles_lost: 0, tackles_solo: 0, sacks: 0, interceptions: 0, fgs: 0,
    };
    for (let wkk in player.stats.week) {
        for (let stt in player.stats.week[wkk]) {
            if (seasonstats[stt] !== undefined) seasonstats[stt] += player.stats.week[wkk][stt];
        }
    }
    return seasonstats;
}

var sel = document.getElementById("teamselect");
var s_pos = document.getElementById("s_pos");
var s_name = document.getElementById("s_name");
var s_age = document.getElementById("s_age");
var s_ovr = document.getElementById("s_ovr");
var s_str = document.getElementById("s_str");
var s_spd = document.getElementById("s_spd");
var s_sta = document.getElementById("s_sta");
var sps = document.getElementById("posspecific");
var s_ps = document.getElementById("s_ps");
var statsdisplay = document.getElementById("pstats");

sel.addEventListener("change", function () {
    var team = allteams[this.value];
    var d = document.getElementById("myplayers");
    var d2 = document.getElementById("teamstats");
    d2.innerHTML = "";
    d.innerHTML = "";
    var sp = team.sortedPlayers();
    const playerTeamForBadge = allteams.find(t => t.playerTeam);
    const isOwnTeam = playerTeamForBadge && team === playerTeamForBadge;

    // ─── Cards with OFFENSE / DEFENSE section dividers ───────────────
    const offensePlayers = sp.filter(p => p.unit === "offense");
    const defensePlayers = sp.filter(p => p.unit === "defense");

    function renderSection(label, players) {
        if (players.length === 0) return;
        // Section header
        const header = document.createElement("div");
        header.className = "roster-section-header";
        header.textContent = label;
        d.appendChild(header);

        // Card grid wrapper
        const grid = document.createElement("div");
        grid.className = "roster-card-grid";

        for (const player of players) {
            const dv = document.createElement("div");
            dv.className = "player-card";

            const [firstName, ...lastParts] = player.name.split(' ');
            const lastName = lastParts.join(' ');
            const isRookieBadge = isOwnTeam && player.contract_type === 'rookie';
            const isRetireBadge = player.age >= 33;
            const expiringBadge = isOwnTeam && player.contract_years_left <= 1 && player.contract_years_left !== undefined && player.contract_salary > 0;
            const hasDemand = isOwnTeam && player.demandPending;

            let badges = '';
            if (isRookieBadge) badges += '<span class="card-badge card-badge--rookie">R</span>';
            if (isRetireBadge) badges += '<span class="card-badge card-badge--retire">⚠</span>';
            if (expiringBadge && !isRookieBadge) badges += '<span class="card-badge card-badge--expiring">!</span>';
            if (hasDemand) badges += '<span class="card-badge card-badge--demand">😤</span>';

            // Morale bar on card (own team only)
            let moraleStrip = '';
            if (isOwnTeam) {
                const m = moraleLabel(player.morale || 75);
                moraleStrip = `<div class="card-morale-bar"><div class="card-morale-fill ${m.cls}" style="width:${player.morale || 75}%"></div></div>`;
            }

            dv.innerHTML = `<span class="card-pos">${player.position}</span>${badges}${moraleStrip}<span class="card-name">${firstName}<br>${lastName}</span><span class="card-stars">${toStars(player.overall())}</span>`;

            (function(p) {
                dv.addEventListener("click", function() {
                    document.querySelectorAll('.player-card').forEach(c => c.classList.remove('player-card--selected'));
                    dv.classList.add('player-card--selected');
                    renderPlayerDetail(p, isOwnTeam);
                });
            })(player);

            grid.appendChild(dv);
        }
        d.appendChild(grid);
    }

    renderSection("OFFENSE", offensePlayers);
    renderSection("DEFENSE", defensePlayers);

    // Team summary
    d2.innerHTML = `
        <div class="teamstats-row">
            <div class="teamstats-cell">
                <span class="teamstats-label">OFF</span>
                <span class="teamstats-value">${team.offenseRating()}</span>
            </div>
            <div class="teamstats-cell">
                <span class="teamstats-label">DEF</span>
                <span class="teamstats-value">${team.defenseRating()}</span>
            </div>
            <div class="teamstats-cell">
                <span class="teamstats-label">OFF DEPTH</span>
                <span class="teamstats-value">${team.offenseDepth().score}</span>
            </div>
            <div class="teamstats-cell">
                <span class="teamstats-label">DEF DEPTH</span>
                <span class="teamstats-value">${team.defenseDepth().score}</span>
            </div>
        </div>
    `;
});

function renderPlayerDetail(player, isOwnTeam) {
    s_pos.innerHTML = player.position;
    s_name.innerHTML = player.name;
    const ageLabel = player.age >= 33 ? `${player.age} <span style="color:var(--red);font-size:10px;">▲ AGING</span>` : player.age;
    s_age.innerHTML = ageLabel;
    s_ovr.innerHTML = player.overall() + " " + toStars(player.overall()) + "";
    s_str.innerHTML = toStars(player.strength);
    s_spd.innerHTML = toStars(player.speed);
    s_sta.innerHTML = toStars(player.stamina);
    sps.innerHTML = player.posStat()[1];
    s_ps.innerHTML = toStars(player.posStat()[0]);

    // Morale display
    let moraleEl = document.getElementById("s_morale");
    if (!moraleEl) {
        moraleEl = document.createElement("div");
        moraleEl.id = "s_morale";
        moraleEl.style.cssText = "margin-top:12px;margin-bottom:4px;";
        s_ps.parentElement.insertBefore(moraleEl, s_ps.nextSibling);
    }
    if (isOwnTeam) {
        const m = moraleLabel(player.morale || 75);
        const loyalty = player.seasonsWithTeam || 0;
        const loyaltyStr = loyalty === 0 ? "New arrival" : loyalty === 1 ? "1 season" : `${loyalty} seasons`;
        moraleEl.innerHTML = `
            <div class="detail-morale-row">
                <span class="detail-morale-label">MORALE</span>
                <span class="${m.cls} detail-morale-val">${m.txt} (${player.morale})</span>
            </div>
            ${moraleBar(player.morale)}
            <div class="detail-loyalty">With team: ${loyaltyStr}</div>
            <div class="detail-interact-btns">
                <button class="praise-btn" onclick="praisePlayer('${player.name.replace(/'/g,"\\'")}')">💬 Praise (+12 Morale)</button>
            </div>
        `;
    } else {
        moraleEl.innerHTML = "";
    }

    // Contract info
    let contractEl = document.getElementById("s_contract");
    if (!contractEl) {
        contractEl = document.createElement("div");
        contractEl.id = "s_contract";
        contractEl.style.cssText = "margin-top:10px;font-family:var(--mono);font-size:11px;border-top:1px solid var(--border);padding-top:8px;";
        moraleEl.after(contractEl);
    }
    const viewingPT = allteams.find(t => t.playerTeam);
    if (isOwnTeam && player.contract_salary) {
        const ctType = player.contract_type === "rookie"
            ? '<span style="color:var(--accent);font-size:10px;">ROOKIE</span>'
            : '<span style="color:var(--muted);font-size:10px;">VETERAN</span>';
        const ctYrs = player.contract_years_left <= 1
            ? `<span style="color:var(--red)">${player.contract_years_left} YR LEFT</span>`
            : `${player.contract_years_left} YRS LEFT`;
        contractEl.innerHTML = `<div style="color:var(--muted);letter-spacing:0.08em;margin-bottom:4px;">CONTRACT</div>${ctType} · $${player.contract_salary}M/yr · ${ctYrs}`;
    } else {
        contractEl.innerHTML = "";
    }

    const awardsEl = document.getElementById("s_awards") || (() => {
        const el = document.createElement("div");
        el.id = "s_awards";
        s_ps.after(el);
        return el;
    })();
    if (player.awards && player.awards.length) {
        awardsEl.innerHTML = player.awards.map(a => `<span class="award-badge">${a}</span>`).join("");
    } else { awardsEl.innerHTML = ""; }

    // Cut button
    let cutBtnEl = document.getElementById("s_cut");
    if (!cutBtnEl) {
        cutBtnEl = document.createElement("div");
        cutBtnEl.id = "s_cut";
        awardsEl.after(cutBtnEl);
    }
    cutBtnEl.innerHTML = "";

    if (isOwnTeam) {
        const cutBtn = document.createElement("button");
        cutBtn.textContent = "✂ CUT PLAYER";
        cutBtn.style.cssText = "margin-top:12px;background:transparent;border:1px solid var(--red);color:var(--red);font-size:11px;padding:6px 14px;display:block;";

        const confirmDiv = document.createElement("div");
        confirmDiv.style.cssText = "display:none;margin-top:8px;font-family:var(--mono);font-size:11px;color:var(--muted);";
        const confirmMsg = document.createElement("span");
        confirmMsg.textContent = "Cut " + player.name + "? ";
        const yesBtn = document.createElement("button");
        yesBtn.textContent = "CUT";
        yesBtn.style.cssText = "background:var(--red);border-color:var(--red);color:#fff;font-size:11px;padding:4px 10px;margin:0 4px;";
        const noBtn = document.createElement("button");
        noBtn.textContent = "Cancel";
        noBtn.style.cssText = "font-size:11px;padding:4px 10px;margin:0;";
        confirmDiv.appendChild(confirmMsg); confirmDiv.appendChild(yesBtn); confirmDiv.appendChild(noBtn);

        cutBtn.addEventListener("click", function() {
            confirmDiv.style.display = confirmDiv.style.display === "none" ? "block" : "none";
        });
        yesBtn.addEventListener("click", function() {
            const viewingPlayerTeam = allteams.find(t => t.playerTeam);
            const idx = viewingPlayerTeam.players.indexOf(player);
            if (idx !== -1) {
                viewingPlayerTeam.players.splice(idx, 1);
                cutBtnEl.innerHTML = "";
                s_pos.innerHTML = ""; s_name.innerHTML = "—"; s_age.innerHTML = "";
                s_ovr.innerHTML = ""; s_str.innerHTML = ""; s_spd.innerHTML = "";
                s_sta.innerHTML = ""; sps.innerHTML = ""; s_ps.innerHTML = "";
                awardsEl.innerHTML = ""; statsdisplay.innerHTML = "";
                moraleEl.innerHTML = ""; contractEl.innerHTML = "";
                sel.dispatchEvent(new Event("change", { bubbles: true }));
            }
        });
        noBtn.addEventListener("click", function() { confirmDiv.style.display = "none"; });
        cutBtnEl.appendChild(cutBtn); cutBtnEl.appendChild(confirmDiv);
    }

    statsdisplay.innerHTML = "";
    var seasonstats = renderSeasonStats(player);
    var seasonHeader = document.createElement("div");
    seasonHeader.innerHTML = "<strong>Season Totals</strong>";
    statsdisplay.appendChild(seasonHeader);

    for (var stat in seasonstats) {
        if (seasonstats[stat] === 0) continue;
        var dv = document.createElement("div");
        dv.innerHTML = statLabel(stat) + ": " + seasonstats[stat];
        statsdisplay.appendChild(dv);
        if (stat === "attempts" && seasonstats["completions"]) {
            var compPct = document.createElement("div");
            compPct.innerHTML = "Comp%: " + (seasonstats["completions"] / seasonstats["attempts"] * 100).toFixed(2) + "%";
            statsdisplay.appendChild(compPct);
        }
    }

    var weekHeader = document.createElement("div");
    weekHeader.innerHTML = "<strong>Weekly Stats</strong>";
    statsdisplay.appendChild(weekHeader);

    var wk = 1;
    for (var w in player.stats.week) {
        var weekDiv = document.createElement("div");
        var tx = "Week " + wk + ": ";
        for (var stt in player.stats.week[w]) {
            if (player.stats.week[w][stt] !== 0) tx += statLabel(stt) + ": " + player.stats.week[w][stt] + ", ";
        }
        tx = tx.replace(/,\s*$/, "");
        weekDiv.innerHTML = tx;
        statsdisplay.appendChild(weekDiv);
        wk++;
    }
}

function display(s) {
    document.getElementById("afc").style.display = "none";
    document.getElementById("nfc").style.display = "none";
    document.getElementById("playoffpicture").style.display = "none";
    document.getElementById("leaders").style.display = "none";

    if (s === "afc") document.getElementById("afc").style.display = "block";
    if (s === "nfc") document.getElementById("nfc").style.display = "block";
    if (s === "playoff") document.getElementById("playoffpicture").style.display = "block";
    if (s === "leaders") document.getElementById("leaders").style.display = "block";
}



// =====================================================================
// DRAFT SYSTEM
// =====================================================================

const DRAFT_ROUNDS = 3;
const POSITIONS_POOL = ["QB", "RB", "WR", "WR", "WR", "TE", "TE", "OL", "OL", "DL", "DL", "LB", "LB", "DB", "DB", "K"];

// Rating ranges per round (min, max) on 1–10 scale
// Round 1: 2.5-3★ = 5-6/10   Round 2: 1.5-2★ = 3-4/10   Round 3: 0.5-1★ = 1-2/10
const ROUND_STAT_RANGES = {
    1: [2, 10],
    2: [1, 6],
    3: [1, 3],
};

var draftState = {
    active: false,
    pickList: [],
    currentPickIdx: 0,
    prospects: [],
    playerPickIdx: -1,
    draftLog: [],
    showRoster: false,
};

// =====================================================================
// TRADE SYSTEM
// =====================================================================

// Trade value table: pick round → value points
// Values boosted to match new expensive player market
function pickValue(round) {
    return { 1: 150, 2: 75, 3: 30 }[round] || 15;
}

// =====================================================================
// CONTRACT / SALARY CAP SYSTEM (player team only)
// =====================================================================
let SALARY_CAP = 120; // overridden by gameSettings.salaryCap at runtime

// Calculate the market-rate annual salary for a player based on overall rating.
// Rookie contracts are capped cheaply by draftRound.
function calcMarketSalary(player) {
    if (player.contract_type === 'rookie') {
        // Rookies: round 1 = 4M, round 2 = 2.5M, round 3 = 1.5M
        const rookiePay = { 1: 4, 2: 2.5, 3: 1.5 };
        return rookiePay[player.draftRound] || 1.5;
    }
    // Veteran market rate: heavily exponential — 5★ is VERY expensive
    // 1★ ≈ $1M, 2★ ≈ $3M, 3★ ≈ $8M, 3.5★ ≈ $14M, 4★ ≈ $22M, 4.5★ ≈ $36M, 5★ ≈ $55M+
    const ovr = player.overall();
    return Math.round(Math.pow(ovr / 10, 2.8) * 65 * 10) / 10;
}

// ─── MORALE SYSTEM ────────────────────────────────────────────────────
// morale (0-100) affects:
//   • re-sign asking price: up to -30% discount at 100 morale, +20% premium at <30
//   • player demands: low morale + high ovr triggers "trade me" / "start me"
//   • morale is shown on roster cards
// ──────────────────────────────────────────────────────────────────────

function moraleLabel(m) {
    if (m >= 90) return { txt: "Ecstatic", cls: "morale-great" };
    if (m >= 75) return { txt: "Happy", cls: "morale-good" };
    if (m >= 55) return { txt: "Content", cls: "morale-ok" };
    if (m >= 35) return { txt: "Unhappy", cls: "morale-low" };
    return { txt: "Furious", cls: "morale-bad" };
}

function moraleBar(m) {
    const { cls } = moraleLabel(m);
    return `<div class="morale-bar-track"><div class="morale-bar-fill ${cls}" style="width:${m}%"></div></div>`;
}

// Contract discount factor from morale (0.70 at 100 morale, 1.20 at 0 morale)
function moraleContractMultiplier(player) {
    const m = clamp(player.morale, 0, 100);
    const loyalty = clamp(player.seasonsWithTeam, 0, 6);
    // Morale component: 1.20 → 0.70 as morale goes 0 → 100
    const moraleEffect = 1.20 - (m / 100) * 0.50;
    // Loyalty component: each season knocks 3% off, capped at 18%
    const loyaltyDiscount = loyalty * 0.03;
    return Math.max(0.55, moraleEffect - loyaltyDiscount);
}

// Boost/drain morale in response to a game result (called each week)
function updatePlayerMorale(playerTeam, won) {
    for (const p of playerTeam.players) {
        let delta = 0;
        if (won) delta += randrange(2, 5);
        else delta -= randrange(2, 5);
        // Older players dip slightly each week (fading career anxiety)
        if (p.age >= 32) delta -= 1;
        // Random personality swing (±3)
        delta += randrange(-3, 3);
        p.morale = clamp((p.morale || 75) + delta, 5, 100);
    }
}

// After each season, morale normalises toward 65 (fresh-start effect)
function endSeasonMoraleReset(playerTeam) {
    for (const p of playerTeam.players) {
        p.seasonsWithTeam = (p.seasonsWithTeam || 0) + 1;
        // Drift toward 65
        p.morale = Math.round(p.morale * 0.6 + 65 * 0.4);
        p.demandPending = null;
    }
}

// Check for player demands at start of each week
// Unhappy stars can demand a trade or more playing time
var activeDemands = []; // {player, type, week}

function checkPlayerDemands(playerTeam) {
    if (!playerTeam) return;
    for (const p of playerTeam.players) {
        if (p.demandPending) continue; // already has a demand active
        const ovr = p.overall();
        const m = p.morale || 75;
        // Only stars (3.5★+, ovr≥7) can demand things
        if (ovr < 7) continue;
        // Demand probability: low morale + high rating
        const demandChance = Math.max(0, (30 - m) / 30 * 0.35 * ((ovr - 6) / 4));
        if (Math.random() < demandChance) {
            const type = m < 25 ? "trade" : "start";
            p.demandPending = type;
            p.demandWeek = current_week;
            activeDemands.push({ player: p, type, week: current_week });
            showDemandNotification(p, type);
        }
    }
}

function showDemandNotification(player, type) {
    const msg = type === "trade"
        ? `😤 ${player.name} demands a trade!`
        : `⚡ ${player.name} demands more playing time!`;
    // Add to #week log
    const wk = document.getElementById("week");
    if (wk) {
        const d = document.createElement("div");
        d.style.cssText = "color:var(--red);font-weight:600;margin:4px 0;";
        d.textContent = msg;
        wk.appendChild(d);
    }
    // Show a demand badge button
    renderDemandsBadge();
}

function renderDemandsBadge() {
    const btns = document.getElementById("btns");
    if (!btns) return;
    let badge = document.getElementById("demands-notification");
    const playerTeam = allteams.find(t => t.playerTeam);
    if (!playerTeam) return;
    const pending = playerTeam.players.filter(p => p.demandPending);
    if (pending.length === 0) {
        if (badge) badge.style.display = "none";
        return;
    }
    if (!badge) {
        badge = document.createElement("button");
        badge.id = "demands-notification";
        badge.onclick = () => goDemands();
        badge.style.cssText = "background:var(--red);border-color:var(--red);color:#fff;";
        btns.appendChild(badge);
    }
    badge.textContent = `😤 DEMANDS (${pending.length})`;
    badge.style.display = "";
}

// ── Demands screen ──
function goDemands() {
    const allScreens = ["menu","settings","office","roster","league","draft","trades","demands"];
    allScreens.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = "none"; });
    let el = document.getElementById("demands");
    if (!el) {
        el = document.createElement("div");
        el.id = "demands";
        el.className = "screen";
        document.body.appendChild(el);
    }
    el.style.display = "block";
    renderDemandsScreen(el);
}

function renderDemandsScreen(el) {
    const playerTeam = allteams.find(t => t.playerTeam);
    const pending = playerTeam ? playerTeam.players.filter(p => p.demandPending) : [];
    let html = `<button onclick="goMenu()">← BACK</button><div class="demands-screen">
    <div class="demands-title">PLAYER DEMANDS</div>`;
    if (pending.length === 0) {
        html += `<div class="demands-empty">No active demands. Keep your players happy!</div>`;
    }
    for (const p of pending) {
        const m = moraleLabel(p.morale);
        const typeLabel = p.demandPending === "trade" ? "TRADE REQUEST" : "PLAYING TIME DEMAND";
        const typeClass = p.demandPending === "trade" ? "demand-trade" : "demand-start";
        html += `<div class="demand-card">
            <div class="demand-card-left">
                <div class="demand-pos-badge">${p.position}</div>
                <div class="demand-name">${p.name}</div>
                <div class="demand-info">${toStars(p.overall())} · Age ${p.age} · <span class="${m.cls}">${m.txt}</span></div>
                ${moraleBar(p.morale)}
            </div>
            <div class="demand-card-right">
                <div class="demand-type ${typeClass}">${typeLabel}</div>
                <div class="demand-desc">${p.demandPending === "trade"
                    ? `${p.name} is unhappy and wants out. Trade them or try to repair the relationship.`
                    : `${p.name} feels underused. Praise them or accept their demand.`
                }</div>
                <div class="demand-actions">
                    <button class="demand-btn demand-btn-praise" onclick="demandAction('${p.name}','praise')">💬 PRAISE (+15 Morale)</button>
                    <button class="demand-btn demand-btn-meet" onclick="demandAction('${p.name}','meet')">🤝 PROMISE MORE ROLE (+25 Morale, drops demand)</button>
                    <button class="demand-btn demand-btn-ignore" onclick="demandAction('${p.name}','ignore')">🙄 IGNORE (−10 Morale)</button>
                </div>
            </div>
        </div>`;
    }
    html += `</div>`;
    el.innerHTML = html;
    // Re-append back button's goMenu behavior
    el.querySelector("button").onclick = () => goMenu();
}

function demandAction(playerName, action) {
    const playerTeam = allteams.find(t => t.playerTeam);
    if (!playerTeam) return;
    const p = playerTeam.players.find(pl => pl.name === playerName);
    if (!p) return;
    if (action === "praise") {
        p.morale = clamp(p.morale + 15, 0, 100);
        // doesn't clear demand, but improves mood
    } else if (action === "meet") {
        p.morale = clamp(p.morale + 25, 0, 100);
        p.demandPending = null;
    } else if (action === "ignore") {
        p.morale = clamp(p.morale - 10, 0, 100);
        // demand escalates if already "start" → "trade"
        if (p.demandPending === "start") p.demandPending = "trade";
    }
    renderDemandsBadge();
    const el = document.getElementById("demands");
    if (el && el.style.display !== "none") renderDemandsScreen(el);
}

// Also allow praising a player from the roster screen
function praisePlayer(playerName) {
    const playerTeam = allteams.find(t => t.playerTeam);
    if (!playerTeam) return;
    const p = playerTeam.players.find(pl => pl.name === playerName);
    if (!p) return;
    p.morale = clamp(p.morale + 12, 0, 100);
    // Re-render roster if open
    const rEl = document.getElementById("roster");
    if (rEl && rEl.style.display !== "none") {
        document.getElementById("teamselect").dispatchEvent(new Event("change", { bubbles: true }));
    }
}

function criticizePlayer(playerName) {
    const playerTeam = allteams.find(t => t.playerTeam);
    if (!playerTeam) return;
    const p = playerTeam.players.find(pl => pl.name === playerName);
    if (!p) return;
    p.morale = clamp(p.morale - 15, 0, 100);
    const rEl = document.getElementById("roster");
    if (rEl && rEl.style.display !== "none") {
        document.getElementById("teamselect").dispatchEvent(new Event("change", { bubbles: true }));
    }
}

// Return the total salary cap used by the player team
function getCapUsed(playerTeam) {
    return Math.round(playerTeam.players.reduce((sum, p) => sum + (p.contract_salary || 0), 0) * 10) / 10;
}

// Assign an initial contract to a player when they join the player team from initial gen
function assignInitialContract(player) {
    player.contract_type = 'veteran';
    player.contract_years_left = randrange(1, 4);
    player.contract_salary = Math.max(1, calcMarketSalary(player) * (0.8 + Math.random() * 0.4));
    player.contract_salary = Math.round(player.contract_salary * 10) / 10;
    player.morale = randrange(60, 85); // varies by "inherited" team situation
    player.seasonsWithTeam = randrange(0, 3); // some players have been here a while
}

// Assign a rookie contract when a player is drafted by the player team
function assignRookieContract(player) {
    player.contract_type = 'rookie';
    player.contract_years_left = 4;
    player.contract_salary = calcMarketSalary(player);
    player.morale = randrange(80, 95); // rookies are excited
    player.seasonsWithTeam = 0;
}
function playerValue(player) {
    const ovr = player.overall();
    // Exponential curve: 5★=600, 4.5★=380, 4★=220, 3.5★=120, 3★=60, 2★=20, 1★=5
    return Math.round(Math.pow(ovr / 10, 3.2) * 700);
}

// Trade deadline: no trades after this week (0-indexed, week 10 = after 10 games played)
let TRADE_DEADLINE_WEEK = 10; // overridden by gameSettings.tradeDeadlineWeek

// pending CPU-initiated trade offers: [{offeringTeam, theyGive:[], theyWant:[], expires}]
var pendingTradeOffers = [];

// Build a human-readable label for a trade asset
function assetLabel(asset) {
    if (asset.type === "player") return `${asset.player.position} ${asset.player.name} (${toStars(asset.player.overall())})`;
    if (asset.type === "pick") {
        const pickYear = year + (asset.futureYear || 0);
        const slotStr = asset.pick ? ` #${asset.pick}` : "";
        return `${pickYear} R${asset.round}${slotStr}`;
    }
    return "?";
}
function assetValue(asset) {
    if (asset.type === "player") return playerValue(asset.player);
    if (asset.type === "pick") {
        const futureDiscount = asset.futureYear ? Math.pow(0.80, asset.futureYear) : 1;
        return Math.round(pickValue(asset.round) * futureDiscount);
    }
    return 0;
}

// ─── TIGHTENED TRADE EVALUATION ─────────────────────────────────────
// CPU now requires they receive at least 95-105% of what they give up
// (a small random band around 1.0 so not every near-equal trade goes through).
// This means the player must offer genuinely fair-to-slightly-favourable
// value — lowball offers will always be rejected.
// ─────────────────────────────────────────────────────────────────────
function cpuEvaluateTrade(cpuTeam, theyGive, theyReceive) {
    const giveVal = theyGive.reduce((s, a) => s + assetValue(a), 0);
    const getVal  = theyReceive.reduce((s, a) => s + assetValue(a), 0);
    if (giveVal === 0) return false; // CPU never accepts getting nothing
    // Require threshold based on agression setting — random band so identical offers aren't
    // always accepted/rejected deterministically.
    const base = 0.92 * gameSettings.cpuTradeAggression;
    const threshold = giveVal * (base + Math.random() * 0.10);
    return getVal >= threshold;
}

// Execute a completed trade: swap assets between two teams
function executeTrade(team1, team1Gives, team2, team2Gives) {
    // team1 gives assets to team2, team2 gives assets to team1
    for (const asset of team1Gives) {
        if (asset.type === "player") {
            team1.players.splice(team1.players.indexOf(asset.player), 1);
            asset.player.team = team2;
            team2.players.push(asset.player);
        } else if (asset.type === "pick") {
            // Remove matching pick from team1's draftPicks
            const pi = team1.draftPicks.findIndex(p =>
                p.round === asset.round &&
                (asset.futureYear !== undefined ? p.futureYear === asset.futureYear : true) &&
                (asset.pick ? p.pick === asset.pick : true)
            );
            if (pi !== -1) team1.draftPicks.splice(pi, 1);
            team2.draftPicks.push({ round: asset.round, pick: asset.pick, overall: asset.overall, fromTrade: true, futureYear: asset.futureYear || 0, _origTeam: asset._origTeam || team1.name });
        }
    }
    for (const asset of team2Gives) {
        if (asset.type === "player") {
            team2.players.splice(team2.players.indexOf(asset.player), 1);
            asset.player.team = team1;
            // If the player had no salary set (CPU team player), assign market contract
            if (team1.playerTeam && !asset.player.contract_salary) {
                asset.player.contract_type = 'veteran';
                asset.player.contract_years_left = randrange(1, 3);
                asset.player.contract_salary = Math.round(calcMarketSalary(asset.player) * 10) / 10;
            }
            // New arrival — reset loyalty and apply slight morale dip
            if (team1.playerTeam) {
                asset.player.seasonsWithTeam = 0;
                asset.player.morale = clamp((asset.player.morale || 75) - 10, 10, 90);
            }
            team1.players.push(asset.player);
        } else if (asset.type === "pick") {
            const pi = team2.draftPicks.findIndex(p =>
                p.round === asset.round &&
                (asset.futureYear !== undefined ? p.futureYear === asset.futureYear : true) &&
                (asset.pick ? p.pick === asset.pick : true)
            );
            if (pi !== -1) team2.draftPicks.splice(pi, 1);
            team1.draftPicks.push({ round: asset.round, pick: asset.pick, overall: asset.overall, fromTrade: true, futureYear: asset.futureYear || 0, _origTeam: asset._origTeam || team2.name });
        }
    }
}

// CPU generates random trade offers toward the player team (called each week)
function maybeCpuTradeOffer() {
    const playerTeam = allteams.find(t => t.playerTeam);
    if (!playerTeam) return;
    // No trades after the trade deadline
    TRADE_DEADLINE_WEEK = gameSettings.tradeDeadlineWeek;
    if (current_week >= TRADE_DEADLINE_WEEK) return;
    if (pendingTradeOffers.length >= 2) return; // max 2 queued at a time
    if (Math.random() > (gameSettings.cpuTradeFrequency / 100)) return; // chance per week from settings

    const cpuTeams = allteams.filter(t => !t.playerTeam && t.players.length > 3);
    if (!cpuTeams.length) return;
    const cpuTeam = cpuTeams[randrange(0, cpuTeams.length - 1)];

    // Helper: sort players by value descending, pick one of the top half (interesting players)
    function getInterestingPlayer(team) {
        const sorted = [...team.players].sort((a, b) => playerValue(b) - playerValue(a));
        const pool = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 2)));
        return pool[randrange(0, pool.length - 1)];
    }

    // Decide offer type: 0=player-for-player, 1=player+pick-for-star, 2=pick-swap, 3=multi-player package, 4=star-for-picks
    const offerType = randrange(0, 4);
    let theyGive = [], theyWant = [];

    if (offerType === 0) {
        // CPU offers a quality player for one of the human's similar-value players
        if (!cpuTeam.players.length || !playerTeam.players.length) return;
        const cpuPlayer = getInterestingPlayer(cpuTeam);
        const cpuVal = playerValue(cpuPlayer);
        const candidates = playerTeam.players.filter(p => {
            const v = playerValue(p);
            return v >= cpuVal * 0.85 && v <= cpuVal * 1.20;
        });
        if (!candidates.length) return;
        const target = candidates[randrange(0, candidates.length - 1)];
        theyGive = [{ type: "player", player: cpuPlayer }];
        theyWant = [{ type: "player", player: target }];

    } else if (offerType === 1) {
        // CPU offers a player + pick package for a star player on the human team
        if (!cpuTeam.players.length || !cpuTeam.draftPicks.length || !playerTeam.players.length) return;
        // Target a star on the player's team (top 3 by value)
        const humanSorted = [...playerTeam.players].sort((a, b) => playerValue(b) - playerValue(a));
        const target = humanSorted[randrange(0, Math.min(2, humanSorted.length - 1))];
        const targetVal = playerValue(target);
        // CPU offers a player + a pick to make it worth it
        const cpuPlayer = getInterestingPlayer(cpuTeam);
        const cpuPick = cpuTeam.draftPicks[0]; // best pick (lowest round number)
        const offerVal = playerValue(cpuPlayer) + pickValue(cpuPick.round);
        if (offerVal < targetVal * 0.75 || offerVal > targetVal * 1.30) return; // must be somewhat fair
        theyGive = [{ type: "player", player: cpuPlayer }, { type: "pick", ...cpuPick }];
        theyWant = [{ type: "player", player: target }];

    } else if (offerType === 2) {
        // CPU offers picks (possibly future) for human's pick (upgrade trade)
        const allCpuPicks = cpuTeam.draftPicks || [];
        const allPlayerPicks = playerTeam.draftPicks || [];
        if (!allCpuPicks.length || !allPlayerPicks.length) return;
        const cpuPick = allCpuPicks[randrange(0, allCpuPicks.length - 1)];
        const playerPick = allPlayerPicks.filter(p => (p.futureYear||0) === 0);
        if (!playerPick.length) return;
        const pp = playerPick[randrange(0, playerPick.length - 1)];
        if (cpuPick.round === pp.round && (cpuPick.futureYear||0) === 0) return;
        // Only offer if CPU pick gives upgrade value (earlier round or current vs future)
        theyGive = [{ type: "pick", ...cpuPick }];
        theyWant = [{ type: "pick", ...pp }];

    } else if (offerType === 3) {
        // CPU offers two players for one star (package deal)
        if (cpuTeam.players.length < 4 || !playerTeam.players.length) return;
        const humanSorted = [...playerTeam.players].sort((a, b) => playerValue(b) - playerValue(a));
        const target = humanSorted[randrange(0, Math.min(2, humanSorted.length - 1))];
        const targetVal = playerValue(target);
        // Find two CPU players whose combined value is close to target
        const cpuSorted = [...cpuTeam.players].sort((a, b) => playerValue(b) - playerValue(a));
        const p1 = cpuSorted[0];
        const p2 = cpuSorted[1];
        if (!p1 || !p2) return;
        const offerVal = playerValue(p1) + playerValue(p2);
        if (offerVal < targetVal * 0.80 || offerVal > targetVal * 1.40) return;
        theyGive = [{ type: "player", player: p1 }, { type: "player", player: p2 }];
        theyWant = [{ type: "player", player: target }];

    } else {
        // CPU desperately wants picks — offers their best player for human's early picks
        if (cpuTeam.players.length < 3 || !playerTeam.draftPicks.length) return;
        const cpuPlayer = getInterestingPlayer(cpuTeam);
        const cpuVal = playerValue(cpuPlayer);
        const goodPicks = playerTeam.draftPicks.filter(p => pickValue(p.round) >= cpuVal * 0.60);
        if (!goodPicks.length) return;
        const pk = goodPicks[randrange(0, goodPicks.length - 1)];
        theyGive = [{ type: "player", player: cpuPlayer }];
        theyWant = [{ type: "pick", ...pk }];
    }

    if (!theyGive.length || !theyWant.length) return;
    pendingTradeOffers.push({ offeringTeam: cpuTeam, theyGive, theyWant, expires: current_week + 4 });
    renderTradeNotification();
}


// =====================================================================
// OFFICE SCREEN — Salary Cap & Contract Management
// =====================================================================

function renderOfficeScreen() {
    const playerTeam = allteams.find(t => t.playerTeam);
    const el = document.getElementById("office");
    if (!playerTeam) {
        el.innerHTML = '<button onclick="goMenu()">← BACK</button><div class="office-empty">No team selected yet.</div>';
        return;
    }

    const capUsed = getCapUsed(playerTeam);
    const capLeft = Math.round((SALARY_CAP - capUsed) * 10) / 10;
    const capPct = Math.min(100, Math.round((capUsed / SALARY_CAP) * 100));
    const capClass = capPct > 95 ? "cap-bar-critical" : capPct > 80 ? "cap-bar-warn" : "cap-bar-ok";

    // Sort players: expiring first, then by salary desc
    const sorted = [...playerTeam.players].sort((a, b) => {
        const aExp = a.contract_years_left <= 1 ? 0 : 1;
        const bExp = b.contract_years_left <= 1 ? 0 : 1;
        if (aExp !== bExp) return aExp - bExp;
        return (b.contract_salary || 0) - (a.contract_salary || 0);
    });

    let html = `
    <button onclick="goMenu()">← BACK</button>
    <div class="office-screen">
        <div class="office-header">
            <div class="office-title">FRONT OFFICE</div>
            <div class="office-team">${playerTeam.name}</div>
        </div>

        <div class="cap-section">
            <div class="cap-label-row">
                <span class="cap-label">SALARY CAP</span>
                <span class="cap-numbers"><span class="cap-used">$${capUsed}M</span> / <span class="cap-total">$${SALARY_CAP}M</span> &nbsp; <span class="cap-remaining ${capLeft < 10 ? 'cap-danger' : ''}">$${capLeft}M LEFT</span></span>
            </div>
            <div class="cap-bar-track">
                <div class="cap-bar-fill ${capClass}" style="width:${capPct}%"></div>
            </div>
        </div>

        <div class="office-section-title">ROSTER CONTRACTS</div>
        <div class="office-contracts">
            <div class="contract-header-row">
                <span>PLAYER</span><span>POS</span><span>OVR</span><span>TYPE</span><span>SALARY</span><span>YRS LEFT</span><span>STATUS</span>
            </div>`;

    for (const p of sorted) {
        const sal = p.contract_salary ? `$${p.contract_salary}M` : "—";
        const yrsLeft = p.contract_years_left || 0;
        const typeLabel = p.contract_type === "rookie" ? '<span class="badge-rookie">ROOKIE</span>' : '<span class="badge-vet">VET</span>';
        let statusLabel = "";
        if (yrsLeft === 0) statusLabel = '<span class="badge-expiring">EXPIRED</span>';
        else if (yrsLeft === 1) statusLabel = '<span class="badge-expiring">EXPIRING</span>';
        else statusLabel = `<span class="badge-years">${yrsLeft} YRS</span>`;
        const isRetiring = p.age >= 33;
        const ageStr = isRetiring ? `<span class="age-retire">${p.age} ⚠</span>` : `${p.age}`;

        html += `<div class="contract-row ${yrsLeft <= 1 ? 'contract-row--expiring' : ''}">
            <span class="ctr-name">${p.name} <span class="ctr-age">(${ageStr})</span></span>
            <span class="ctr-pos">${p.position}</span>
            <span class="ctr-ovr">${p.overall().toFixed(1)}</span>
            <span>${typeLabel}</span>
            <span class="ctr-sal">${sal}</span>
            <span class="ctr-yrs">${yrsLeft}</span>
            <span>${statusLabel}</span>
        </div>`;
    }

    html += `</div></div>`;
    el.innerHTML = html;
}

// Re-sign screen: shown at end of season for expiring contracts
var resignState = {
    queue: [],        // players whose contracts expired
    currentIdx: 0,
};

function startResignProcess() {
    const playerTeam = allteams.find(t => t.playerTeam);
    if (!playerTeam) return false;

    // Collect expired contracts
    const expiring = playerTeam.players.filter(p => p.contract_years_left <= 0);
    if (expiring.length === 0) return false;

    resignState.queue = expiring;
    resignState.currentIdx = 0;
    showResignModal();
    return true;
}

function showResignModal() {
    const playerTeam = allteams.find(t => t.playerTeam);
    const player = resignState.queue[resignState.currentIdx];
    if (!player) { closeResignModal(); return; }

    const capUsed = getCapUsed(playerTeam);
    const capLeft = Math.round((SALARY_CAP - capUsed) * 10) / 10;
    const baseSal = Math.round(calcMarketSalary(player) * (1.0 + Math.random() * 0.15) * 10) / 10;
    // Morale discount: loyal happy players ask less
    const moraleMult = moraleContractMultiplier(player);
    const marketSal = Math.round(baseSal * moraleMult * 10) / 10;
    const askingYears = randrange(2, 4);
    const m = moraleLabel(player.morale);

    // Store the offer on the modal state
    resignState.currentOffer = { salary: marketSal, years: askingYears, canAfford: capLeft >= marketSal };

    let modal = document.getElementById("resign-modal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "resign-modal";
        document.body.appendChild(modal);
    }

    const ovr = player.overall().toFixed(1);
    const stars = toStars(player.overall());
    const retireWarning = player.age >= 33 ? `<div class="resign-retire-warn">⚠ Age ${player.age} — may retire soon</div>` : "";
    const capWarning = !resignState.currentOffer.canAfford ? `<div class="resign-cap-warn">⚠ Only $${capLeft}M cap space remaining!</div>` : "";
    const remaining = resignState.queue.length - resignState.currentIdx;
    const loyaltyYrs = player.seasonsWithTeam || 0;
    const loyaltyStr = loyaltyYrs === 0 ? "New arrival" : loyaltyYrs === 1 ? "1 season" : `${loyaltyYrs} seasons`;
    const discountPct = Math.round((1 - moraleMult) * 100);
    const discountNote = discountPct > 0
        ? `<div class="resign-morale-note morale-discount">✓ ${discountPct}% loyalty/morale discount applied</div>`
        : discountPct < 0
        ? `<div class="resign-morale-note morale-premium">⚠ ${Math.abs(discountPct)}% premium — player is unhappy</div>`
        : "";

    modal.innerHTML = `
    <div class="resign-overlay">
        <div class="resign-card">
            <div class="resign-round">${resignState.currentIdx + 1} OF ${resignState.queue.length} EXPIRING CONTRACTS</div>
            <div class="resign-player-name">${player.name}</div>
            <div class="resign-player-info">${player.position} · ${stars} · Age ${player.age}</div>
            <div class="resign-morale-row">
                <span class="${m.cls}">${m.txt}</span>
                <span class="resign-loyalty">with team: ${loyaltyStr}</span>
            </div>
            ${moraleBar(player.morale)}
            ${retireWarning}
            <div class="resign-offer">
                <div class="resign-offer-label">ASKING PRICE</div>
                <div class="resign-offer-value">$${marketSal}M / year · ${askingYears} years</div>
                <div class="resign-offer-total">$${Math.round(marketSal * askingYears * 10)/10}M total</div>
                ${discountNote}
            </div>
            ${capWarning}
            <div class="resign-cap-info">Cap space: <strong>$${capLeft}M</strong></div>
            <div class="resign-actions">
                <button class="resign-btn resign-btn--sign" onclick="resignPlayer(true)">✓ SIGN ($${marketSal}M/yr)</button>
                <button class="resign-btn resign-btn--cut" onclick="resignPlayer(false)">✕ LET GO</button>
            </div>
        </div>
    </div>`;
    modal.style.display = "block";
}

function resignPlayer(sign) {
    const playerTeam = allteams.find(t => t.playerTeam);
    const player = resignState.queue[resignState.currentIdx];
    if (!player) return;

    if (sign) {
        const offer = resignState.currentOffer;
        player.contract_salary = offer.salary;
        player.contract_years_left = offer.years;
        player.contract_type = "veteran";
    } else {
        // Player leaves
        const idx = playerTeam.players.indexOf(player);
        if (idx !== -1) playerTeam.players.splice(idx, 1);
    }

    resignState.currentIdx++;
    if (resignState.currentIdx >= resignState.queue.length) {
        closeResignModal();
    } else {
        showResignModal();
    }
}

function closeResignModal() {
    const modal = document.getElementById("resign-modal");
    if (modal) modal.style.display = "none";
    renderOfficeScreen();
    if (resignState._onComplete) {
        const cb = resignState._onComplete;
        resignState._onComplete = null;
        setTimeout(cb, 200);
    }
}


// =====================================================================
// SETTINGS SYSTEM
// =====================================================================
var gameSettings = {
    // Gameplay
    salaryCap: 120,           // million (editable)
    tradeDeadlineWeek: 10,    // week number
    draftRounds: 3,           // number of draft rounds
    agingSpeed: 1,            // 0.5 = slow, 1 = normal, 1.5 = fast
    injuryRisk: 1,            // 0 = off, 1 = normal
    cpuTradeFrequency: 10,    // % chance per week (default 10%)
    cpuTradeAggression: 1.0,  // multiplier on CPU trade evaluation threshold

    // Display
    showContractOnCards: true,
    showCapWarnings: true,
    animateResults: true,

    // Difficulty
    difficulty: "normal",     // "easy" | "normal" | "hard" | "gm"
};

// Apply difficulty preset
function applyDifficulty(diff) {
    gameSettings.difficulty = diff;
    if (diff === "easy") {
        gameSettings.cpuTradeAggression = 0.85;
        gameSettings.cpuTradeFrequency = 6;
        gameSettings.agingSpeed = 0.8;
    } else if (diff === "normal") {
        gameSettings.cpuTradeAggression = 1.0;
        gameSettings.cpuTradeFrequency = 10;
        gameSettings.agingSpeed = 1.0;
    } else if (diff === "hard") {
        gameSettings.cpuTradeAggression = 1.1;
        gameSettings.cpuTradeFrequency = 15;
        gameSettings.agingSpeed = 1.2;
    } else if (diff === "gm") {
        gameSettings.cpuTradeAggression = 1.2;
        gameSettings.cpuTradeFrequency = 18;
        gameSettings.agingSpeed = 1.5;
        gameSettings.salaryCap = 100;
    }
    renderSettingsScreen();
}

function renderSettingsScreen() {
    const el = document.getElementById("settings");
    const s = gameSettings;

    const diffOptions = ["easy","normal","hard","gm"];
    const diffLabels = { easy:"Easy", normal:"Normal", hard:"Hard", gm:"GM Mode" };
    const diffDescs = {
        easy: "CPU accepts trades more easily. Players age slower.",
        normal: "Balanced experience. Recommended for first playthrough.",
        hard: "CPU is more demanding. Players age faster.",
        gm: "Tighter cap ($100M), fast aging, aggressive CPU. For experts.",
    };

    el.innerHTML = `
    <div class="settings-screen">
        <div class="settings-header">
            <button onclick="goMenu()" class="settings-back">← BACK</button>
            <div class="settings-title">SETTINGS</div>
        </div>

        <div class="settings-body">
            <!-- DIFFICULTY -->
            <div class="settings-section">
                <div class="settings-section-title">DIFFICULTY</div>
                <div class="difficulty-grid">
                    ${diffOptions.map(d => `
                    <div class="diff-card ${s.difficulty === d ? 'diff-card--active' : ''}" onclick="applyDifficulty('${d}')">
                        <div class="diff-card-name">${diffLabels[d]}</div>
                        <div class="diff-card-desc">${diffDescs[d]}</div>
                    </div>`).join('')}
                </div>
            </div>

            <!-- SALARY CAP -->
            <div class="settings-section">
                <div class="settings-section-title">SALARY CAP & CONTRACTS</div>
                <div class="settings-row">
                    <div class="settings-row-label">
                        <span class="settings-label">Salary Cap</span>
                        <span class="settings-hint">Total cap space per season</span>
                    </div>
                    <div class="settings-row-control">
                        <input type="range" min="80" max="200" step="5" value="${s.salaryCap}"
                            oninput="gameSettings.salaryCap=+this.value; document.getElementById('cap-val').textContent='$'+this.value+'M'; SALARY_CAP_VAR=+this.value;">
                        <span class="settings-val" id="cap-val">$${s.salaryCap}M</span>
                    </div>
                </div>
                <div class="settings-row">
                    <div class="settings-row-label">
                        <span class="settings-label">Trade Deadline</span>
                        <span class="settings-hint">No trades after this week</span>
                    </div>
                    <div class="settings-row-control">
                        <input type="range" min="5" max="17" step="1" value="${s.tradeDeadlineWeek}"
                            oninput="gameSettings.tradeDeadlineWeek=+this.value; document.getElementById('td-val').textContent='Week '+this.value;">
                        <span class="settings-val" id="td-val">Week ${s.tradeDeadlineWeek}</span>
                    </div>
                </div>
                <div class="settings-row">
                    <div class="settings-row-label">
                        <span class="settings-label">Draft Rounds</span>
                        <span class="settings-hint">Rounds in the annual draft</span>
                    </div>
                    <div class="settings-row-control">
                        <input type="range" min="1" max="7" step="1" value="${s.draftRounds}"
                            oninput="gameSettings.draftRounds=+this.value; document.getElementById('dr-val').textContent=this.value+' rounds';">
                        <span class="settings-val" id="dr-val">${s.draftRounds} rounds</span>
                    </div>
                </div>
            </div>

            <!-- PLAYER AGING -->
            <div class="settings-section">
                <div class="settings-section-title">PLAYER AGING & RETIREMENT</div>
                <div class="settings-row">
                    <div class="settings-row-label">
                        <span class="settings-label">Aging Speed</span>
                        <span class="settings-hint">How quickly players decline and retire</span>
                    </div>
                    <div class="settings-row-control">
                        <input type="range" min="0.5" max="2.0" step="0.1" value="${s.agingSpeed}"
                            oninput="gameSettings.agingSpeed=+this.value; document.getElementById('age-val').textContent=+this.value+'×';">
                        <span class="settings-val" id="age-val">${s.agingSpeed}×</span>
                    </div>
                </div>
                <div class="settings-row">
                    <div class="settings-row-label">
                        <span class="settings-label">Retirement Age</span>
                        <span class="settings-hint">Players retire at this age</span>
                    </div>
                    <div class="settings-row-control">
                        <input type="range" min="30" max="45" step="1" value="${s.retirementAge || 35}"
                            oninput="gameSettings.retirementAge=+this.value; document.getElementById('ret-val').textContent=this.value;">
                        <span class="settings-val" id="ret-val">${s.retirementAge || 35}</span>
                    </div>
                </div>
            </div>

            <!-- CPU TRADES -->
            <div class="settings-section">
                <div class="settings-section-title">CPU TRADE BEHAVIOR</div>
                <div class="settings-row">
                    <div class="settings-row-label">
                        <span class="settings-label">Trade Offer Frequency</span>
                        <span class="settings-hint">Chance per week of receiving a CPU offer</span>
                    </div>
                    <div class="settings-row-control">
                        <input type="range" min="0" max="40" step="2" value="${s.cpuTradeFrequency}"
                            oninput="gameSettings.cpuTradeFrequency=+this.value; document.getElementById('tfreq-val').textContent=this.value+'%';">
                        <span class="settings-val" id="tfreq-val">${s.cpuTradeFrequency}%</span>
                    </div>
                </div>
                <div class="settings-row">
                    <div class="settings-row-label">
                        <span class="settings-label">CPU Trade Aggression</span>
                        <span class="settings-hint">How demanding CPU is when evaluating offers (higher = harder to trade)</span>
                    </div>
                    <div class="settings-row-control">
                        <input type="range" min="0.7" max="1.5" step="0.05" value="${s.cpuTradeAggression}"
                            oninput="gameSettings.cpuTradeAggression=+this.value; document.getElementById('tagg-val').textContent=(+this.value).toFixed(2)+'×';">
                        <span class="settings-val" id="tagg-val">${s.cpuTradeAggression.toFixed(2)}×</span>
                    </div>
                </div>
            </div>

            <!-- DISPLAY -->
            <div class="settings-section">
                <div class="settings-section-title">DISPLAY</div>
                <div class="settings-row">
                    <div class="settings-row-label">
                        <span class="settings-label">Cap Warnings in Trades</span>
                        <span class="settings-hint">Show salary cap impact when building trades</span>
                    </div>
                    <div class="settings-row-control">
                        <button class="settings-toggle ${s.showCapWarnings ? 'toggle-on' : 'toggle-off'}"
                            onclick="gameSettings.showCapWarnings=!gameSettings.showCapWarnings; renderSettingsScreen();">
                            ${s.showCapWarnings ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>
                <div class="settings-row">
                    <div class="settings-row-label">
                        <span class="settings-label">Contract Info on Cards</span>
                        <span class="settings-hint">Show contract badges on player cards</span>
                    </div>
                    <div class="settings-row-control">
                        <button class="settings-toggle ${s.showContractOnCards ? 'toggle-on' : 'toggle-off'}"
                            onclick="gameSettings.showContractOnCards=!gameSettings.showContractOnCards; renderSettingsScreen();">
                            ${s.showContractOnCards ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>
            </div>

            <!-- ABOUT -->
            <div class="settings-section settings-section--about">
                <div class="settings-section-title">ABOUT</div>
                <div class="settings-about-text">
                    <span class="settings-game-name">ULTRABOWL</span> &nbsp;·&nbsp; Season <span id="s-year">${typeof year !== 'undefined' ? year : '—'}</span>
                </div>
            </div>
        </div>
    </div>`;
}

function renderTradeNotification() {
    let badge = document.getElementById("trade-notification");
    const btns = document.getElementById("btns");
    if (!btns) return;
    if (!badge) {
        badge = document.createElement("button");
        badge.id = "trade-notification";
        badge.onclick = () => goTrades();
        badge.style.cssText = "background:var(--accent2);border-color:var(--accent2);color:#fff;";
        btns.appendChild(badge);
    }
    const count = pendingTradeOffers.filter(o => o.expires >= current_week).length;
    if (count > 0) {
        badge.textContent = `📨 TRADE OFFERS (${count})`;
        badge.style.display = "";
    } else {
        badge.style.display = "none";
    }
}

// ── Trade screen state ──
var tradeScreenState = {
    mode: "hub",        // "hub" | "propose" | "incoming"
    targetTeam: null,
    myOffer: [],        // assets I'm sending
    theirOffer: [],     // assets I'm asking for
    selectedIncoming: null,
};

function goTrades() {
    tradeScreenState.mode = "hub";
    tradeScreenState.myOffer = [];
    tradeScreenState.theirOffer = [];
    tradeScreenState.targetTeam = null;
    const allScreens = ["menu","settings","office","roster","league","draft"];
    allScreens.forEach(id => { const el = document.getElementById(id); if(el) el.style.display = "none"; });
    document.getElementById("trades").style.display = "block";
    renderTradeScreen();
}

function renderTradeScreen() {
    const el = document.getElementById("trades-content");
    if (!el) return;
    const playerTeam = allteams.find(t => t.playerTeam);

    if (tradeScreenState.mode === "hub") {
        // Clean up expired offers
        pendingTradeOffers = pendingTradeOffers.filter(o => o.expires >= current_week);

        let html = `<div class="trade-hub">`;

        // Trade deadline banner
        if (current_week >= TRADE_DEADLINE_WEEK) {
            html += `<div class="trade-deadline-banner">🚫 TRADE DEADLINE HAS PASSED — No trades allowed after Week ${TRADE_DEADLINE_WEEK}</div>`;
        } else {
            const weeksLeft = TRADE_DEADLINE_WEEK - current_week;
            html += `<div class="trade-deadline-info">⏰ Trade Deadline: Week ${TRADE_DEADLINE_WEEK} &nbsp;|&nbsp; ${weeksLeft} week${weeksLeft !== 1 ? 's' : ''} remaining</div>`;
        }

        // Incoming offers section
        html += `<div class="trade-section">
            <div class="trade-section-header">INCOMING OFFERS</div>`;
        if (pendingTradeOffers.length === 0) {
            html += `<div class="trade-empty">No pending offers. Advance weeks to receive offers from CPU teams.</div>`;
        } else {
            for (let i = 0; i < pendingTradeOffers.length; i++) {
                const offer = pendingTradeOffers[i];
                html += `<div class="trade-offer-card" onclick="viewIncomingOffer(${i})">
                    <div class="trade-offer-from">${offer.offeringTeam.name}</div>
                    <div class="trade-offer-summary">
                        <span class="trade-give">They give: ${offer.theyGive.map(assetLabel).join(", ")}</span>
                        <span class="trade-want">They want: ${offer.theyWant.map(assetLabel).join(", ")}</span>
                    </div>
                    <div class="trade-offer-expires">Expires week ${offer.expires}</div>
                </div>`;
            }
        }
        html += `</div>`;

        // Propose trade section
        html += `<div class="trade-section">
            <div class="trade-section-header">PROPOSE A TRADE</div>
            <div class="trade-team-grid">`;
        for (const team of allteams.filter(t => !t.playerTeam)) {
            html += `<div class="trade-team-btn" onclick="startProposeTrade('${team.name}')">
                <span class="trade-team-name">${team.name}</span>
                <span class="trade-team-record">${team.wins}-${team.losses}</span>
            </div>`;
        }
        html += `</div></div></div>`;
        el.innerHTML = html;

    } else if (tradeScreenState.mode === "propose") {
        renderProposeTrade(el, playerTeam);
    } else if (tradeScreenState.mode === "incoming") {
        renderIncomingOffer(el, playerTeam);
    }
}

function startProposeTrade(teamName) {
    tradeScreenState.mode = "propose";
    tradeScreenState.targetTeam = allteams.find(t => t.name === teamName);
    tradeScreenState.myOffer = [];
    tradeScreenState.theirOffer = [];
    renderTradeScreen();
}

function viewIncomingOffer(idx) {
    tradeScreenState.mode = "incoming";
    tradeScreenState.selectedIncoming = idx;
    renderTradeScreen();
}

function renderProposeTrade(el, playerTeam) {
    const cpuTeam = tradeScreenState.targetTeam;

    const myVal = tradeScreenState.myOffer.reduce((s, a) => s + assetValue(a), 0);
    const theirVal = tradeScreenState.theirOffer.reduce((s, a) => s + assetValue(a), 0);
    const fairness = myVal === 0 && theirVal === 0 ? "—" :
        theirVal >= myVal * 0.95 ? "✓ FAIR" : "⚠ UNFAIR";
    const fairClass = fairness === "✓ FAIR" ? "trade-fair" : "trade-unfair";

    // Cap impact calculation
    const capUsed = getCapUsed(playerTeam);
    const capLeft = Math.round((SALARY_CAP - capUsed) * 10) / 10;
    const salaryOut = tradeScreenState.myOffer.filter(a => a.type === "player").reduce((s, a) => s + (a.player.contract_salary || 0), 0);
    const salaryIn  = tradeScreenState.theirOffer.filter(a => a.type === "player").reduce((s, a) => s + calcMarketSalary(a.player), 0);
    const capDelta  = Math.round((salaryIn - salaryOut) * 10) / 10;
    const newCapUsed = Math.round((capUsed + capDelta) * 10) / 10;
    const newCapLeft = Math.round((SALARY_CAP - newCapUsed) * 10) / 10;
    const capOver   = newCapUsed > SALARY_CAP;
    const capDeltaStr = capDelta > 0 ? `+$${capDelta}M` : capDelta < 0 ? `-$${Math.abs(capDelta)}M` : "±$0M";
    const capDeltaClass = capOver ? "cap-delta-over" : capDelta > 0 ? "cap-delta-add" : "cap-delta-save";

    function renderPickList(picks, sideStr) {
        if (!picks || picks.length === 0) return `<div class="trade-empty">No picks</div>`;
        // Group by year
        const byYear = {};
        for (const pk of picks) {
            const yr = pk.futureYear || 0;
            if (!byYear[yr]) byYear[yr] = [];
            byYear[yr].push(pk);
        }
        let html = '';
        for (const yr of Object.keys(byYear).sort((a,b) => a-b)) {
            const pickYear = year + parseInt(yr);
            html += `<div class="trade-avail-header trade-pick-year-header">${pickYear} PICKS</div>`;
            for (const pk of byYear[yr]) {
                const inOffer = (sideStr === 'my' ? tradeScreenState.myOffer : tradeScreenState.theirOffer)
                    .some(a => a.type === "pick" && a.round === pk.round && a.futureYear === (pk.futureYear || 0));
                const pickLabel = pk.pick ? `R${pk.round} · #${pk.pick}` : `R${pk.round} · (future)`;
                const pickData = JSON.stringify({pick: pk.pick, overall: pk.overall, futureYear: pk.futureYear || 0, _origTeam: pk._origTeam});
                const val = Math.round(pickValue(pk.round) * Math.pow(0.80, pk.futureYear || 0));
                html += `<div class="trade-avail-item${inOffer ? ' in-offer' : ''}" onclick='addToOffer("${sideStr}","pick",null,${pk.round},${JSON.stringify({pick: pk.pick, overall: pk.overall, futureYear: pk.futureYear || 0, _origTeam: pk._origTeam})})'>
                    <span class="trade-avail-pos">R${pk.round}</span>
                    <span class="trade-avail-name">${pickLabel}</span>
                    <span class="trade-avail-val">${val}</span>
                </div>`;
            }
        }
        return html;
    }

    let html = `<div class="trade-propose">
        <div class="trade-propose-header">
            <div class="trade-propose-teams">
                <span class="trade-my-team">${playerTeam.name}</span>
                <span class="trade-arrow">⇄</span>
                <span class="trade-cpu-team">${cpuTeam.name}</span>
            </div>
            <div class="trade-value-bar">
                <span>My value: <strong>${myVal}</strong></span>
                <span class="${fairClass}">${fairness}</span>
                <span>Their value: <strong>${theirVal}</strong></span>
            </div>
            <div class="trade-cap-row">
                <span class="trade-cap-label">CAP NOW</span>
                <span class="trade-cap-val">$${capUsed}M / $${SALARY_CAP}M</span>
                <span class="trade-cap-arrow">→</span>
                <span class="trade-cap-label">AFTER</span>
                <span class="trade-cap-val ${capOver ? 'cap-over' : ''}">$${newCapUsed}M / $${SALARY_CAP}M</span>
                <span class="trade-cap-delta ${capDeltaClass}">${capDeltaStr}</span>
                ${capOver ? `<span class="trade-cap-over-warn">⚠ OVER CAP</span>` : ''}
            </div>
        </div>
        <div class="trade-propose-body">`;

    // My side
    html += `<div class="trade-col">
        <div class="trade-col-header">I SEND</div>
        <div class="trade-selected">`;
    if (tradeScreenState.myOffer.length === 0) html += `<div class="trade-empty-slot">Click players/picks below to add</div>`;
    for (let i = 0; i < tradeScreenState.myOffer.length; i++) {
        const a = tradeScreenState.myOffer[i];
        const salStr = a.type === "player" && a.player.contract_salary ? ` · $${a.player.contract_salary}M/yr` : '';
        html += `<div class="trade-asset trade-asset--mine" onclick="removeFromOffer('my',${i})">
            ${assetLabel(a)}${salStr} <span class="trade-asset-val">${assetValue(a)}</span> <span class="trade-remove">✕</span>
        </div>`;
    }
    html += `</div><div class="trade-avail-header">MY PLAYERS</div>`;
    for (const p of playerTeam.sortedPlayers()) {
        const inOffer = tradeScreenState.myOffer.some(a => a.type === "player" && a.player === p);
        html += `<div class="trade-avail-item${inOffer ? ' in-offer' : ''}" onclick="addToOffer('my','player','${p.name.replace(/'/g,"\\'")}')">
            <span class="trade-avail-pos">${p.position}</span>
            <span class="trade-avail-name">${p.name}</span>
            <span class="trade-avail-stars">${toStars(p.overall())}</span>
            <span class="trade-avail-cap" style="font-size:10px;color:var(--muted);">$${p.contract_salary || '?'}M</span>
            <span class="trade-avail-val">${playerValue(p)}</span>
        </div>`;
    }
    html += renderPickList(playerTeam.draftPicks, 'my');
    html += `</div>`;

    // Their side
    html += `<div class="trade-col">
        <div class="trade-col-header">I RECEIVE</div>
        <div class="trade-selected">`;
    if (tradeScreenState.theirOffer.length === 0) html += `<div class="trade-empty-slot">Click players/picks below to add</div>`;
    for (let i = 0; i < tradeScreenState.theirOffer.length; i++) {
        const a = tradeScreenState.theirOffer[i];
        const estSal = a.type === "player" ? ` · est. $${Math.round(calcMarketSalary(a.player)*10)/10}M/yr` : '';
        html += `<div class="trade-asset trade-asset--theirs" onclick="removeFromOffer('their',${i})">
            ${assetLabel(a)}${estSal} <span class="trade-asset-val">${assetValue(a)}</span> <span class="trade-remove">✕</span>
        </div>`;
    }
    html += `</div><div class="trade-avail-header">${cpuTeam.name.toUpperCase()} PLAYERS</div>`;
    for (const p of cpuTeam.sortedPlayers()) {
        const inOffer = tradeScreenState.theirOffer.some(a => a.type === "player" && a.player === p);
        const estSal = Math.round(calcMarketSalary(p) * 10) / 10;
        html += `<div class="trade-avail-item${inOffer ? ' in-offer' : ''}" onclick="addToOffer('their','player','${p.name.replace(/'/g,"\\'")}')">
            <span class="trade-avail-pos">${p.position}</span>
            <span class="trade-avail-name">${p.name}</span>
            <span class="trade-avail-stars">${toStars(p.overall())}</span>
            <span class="trade-avail-cap" style="font-size:10px;color:var(--muted);">est.$${estSal}M</span>
            <span class="trade-avail-val">${playerValue(p)}</span>
        </div>`;
    }
    html += renderPickList(cpuTeam.draftPicks, 'their');
    html += `</div></div>`;

    html += `<div class="trade-actions">
        <button onclick="submitTrade()" class="trade-submit-btn"${capOver ? ' disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>SEND OFFER</button>
        ${capOver ? `<span class="trade-cap-block-msg">Cannot trade — you would exceed the salary cap by $${Math.round((newCapUsed-SALARY_CAP)*10)/10}M</span>` : ''}
        <div id="trade-result" class="trade-result"></div>
    </div></div>`;

    el.innerHTML = html;
}

function renderIncomingOffer(el, playerTeam) {
    const offer = pendingTradeOffers[tradeScreenState.selectedIncoming];
    if (!offer) { tradeScreenState.mode = "hub"; renderTradeScreen(); return; }

    const giveVal = offer.theyGive.reduce((s, a) => s + assetValue(a), 0);
    const wantVal = offer.theyWant.reduce((s, a) => s + assetValue(a), 0);
    const fairClass = giveVal >= wantVal * 0.95 ? "trade-fair" : "trade-unfair";
    const fairText = giveVal >= wantVal * 0.95 ? "✓ FAIR FOR YOU" : "⚠ UNFAVORABLE FOR YOU";

    let html = `<div class="trade-propose">
        <div class="trade-propose-header">
            <div class="trade-propose-teams">
                <span class="trade-cpu-team">${offer.offeringTeam.name}</span>
                <span class="trade-arrow">→ offers</span>
            </div>
            <div class="trade-value-bar">
                <span>They give: <strong>${giveVal}</strong></span>
                <span class="${fairClass}">${fairText}</span>
                <span>They want: <strong>${wantVal}</strong></span>
            </div>
        </div>
        <div class="trade-propose-body">
            <div class="trade-col">
                <div class="trade-col-header">THEY GIVE YOU</div>`;
    for (const a of offer.theyGive) {
        html += `<div class="trade-asset trade-asset--theirs">${assetLabel(a)} <span class="trade-asset-val">${assetValue(a)}</span></div>`;
    }
    html += `</div><div class="trade-col">
                <div class="trade-col-header">THEY WANT</div>`;
    for (const a of offer.theyWant) {
        html += `<div class="trade-asset trade-asset--mine">${assetLabel(a)} <span class="trade-asset-val">${assetValue(a)}</span></div>`;
    }
    html += `</div></div>
        <div class="trade-actions">
            <button onclick="acceptIncomingTrade()" style="background:var(--green);border-color:var(--green);color:var(--bg);">✓ ACCEPT</button>
            <button onclick="declineIncomingTrade()" style="background:transparent;border-color:var(--red);color:var(--red);">✕ DECLINE</button>
            <div id="trade-result" class="trade-result"></div>
        </div>
    </div>`;

    el.innerHTML = html;
}

function addToOffer(side, type, playerName, round, pick, overall) {
    const playerTeam = allteams.find(t => t.playerTeam);
    const cpuTeam = tradeScreenState.targetTeam;
    const arr = side === "my" ? tradeScreenState.myOffer : tradeScreenState.theirOffer;
    const sourceTeam = side === "my" ? playerTeam : cpuTeam;

    if (type === "player") {
        const player = sourceTeam.players.find(p => p.name === playerName);
        if (!player) return;
        if (arr.some(a => a.type === "player" && a.player === player)) return; // already added
        arr.push({ type: "player", player });
    } else if (type === "pick") {
        // futureYear is encoded in the pick parameter as a JSON string (passed from onclick)
        let pickObj;
        if (typeof pick === "object" && pick !== null) {
            pickObj = pick;
        } else {
            // Legacy path — shouldn't be used but fallback
            if (arr.some(a => a.type === "pick" && a.round === round && a.pick === pick)) return;
            arr.push({ type: "pick", round, pick, overall });
            renderTradeScreen();
            return;
        }
        const { futureYear, _origTeam } = pickObj;
        if (arr.some(a => a.type === "pick" && a.round === round && a.futureYear === (futureYear || 0))) return;
        arr.push({ type: "pick", round, pick: pickObj.pick || 0, overall: pickObj.overall || 0, futureYear: futureYear || 0, _origTeam });
    }
    renderTradeScreen();
}

function removeFromOffer(side, idx) {
    if (side === "my") tradeScreenState.myOffer.splice(idx, 1);
    else tradeScreenState.theirOffer.splice(idx, 1);
    renderTradeScreen();
}

function submitTrade() {
    const playerTeam = allteams.find(t => t.playerTeam);
    const cpuTeam = tradeScreenState.targetTeam;
    const myOffer = tradeScreenState.myOffer;
    const theirOffer = tradeScreenState.theirOffer;

    // Check trade deadline
    if (current_week >= TRADE_DEADLINE_WEEK) {
        document.getElementById("trade-result").textContent = `Trade deadline has passed (Week ${TRADE_DEADLINE_WEEK}). No more trades this season.`;
        return;
    }

    if (myOffer.length === 0 && theirOffer.length === 0) {
        document.getElementById("trade-result").textContent = "Add something to the trade first.";
        return;
    }

    // Cap check: would this trade put us over the salary cap?
    const capUsed = getCapUsed(playerTeam);
    const salaryOut = myOffer.filter(a => a.type === "player").reduce((s, a) => s + (a.player.contract_salary || 0), 0);
    const salaryIn  = theirOffer.filter(a => a.type === "player").reduce((s, a) => s + calcMarketSalary(a.player), 0);
    const newCapUsed = capUsed + salaryIn - salaryOut;
    if (newCapUsed > SALARY_CAP) {
        document.getElementById("trade-result").textContent = `⚠ Over salary cap by $${Math.round((newCapUsed - SALARY_CAP)*10)/10}M. Clear cap space first.`;
        document.getElementById("trade-result").className = "trade-result trade-result--rejected";
        return;
    }

    // CPU evaluates: theyGive = theirOffer (what player asks for), theyReceive = myOffer
    const accepted = cpuEvaluateTrade(cpuTeam, theirOffer, myOffer);

    const resultEl = document.getElementById("trade-result");
    if (accepted) {
        executeTrade(playerTeam, myOffer, cpuTeam, theirOffer);
        resultEl.className = "trade-result trade-result--accepted";
        resultEl.textContent = `✓ ${cpuTeam.name} accepted the trade!`;
        tradeScreenState.myOffer = [];
        tradeScreenState.theirOffer = [];
        renderDraftPicksBadge();
        setTimeout(() => renderTradeScreen(), 1500);
    } else {
        resultEl.className = "trade-result trade-result--rejected";
        resultEl.textContent = `✕ ${cpuTeam.name} rejected the offer.`;
    }
}

function acceptIncomingTrade() {
    const playerTeam = allteams.find(t => t.playerTeam);
    const offer = pendingTradeOffers[tradeScreenState.selectedIncoming];
    if (!offer) return;

    if (current_week >= TRADE_DEADLINE_WEEK) {
        const resultEl = document.getElementById("trade-result");
        if (resultEl) { resultEl.className = "trade-result trade-result--rejected"; resultEl.textContent = "Trade deadline has passed — cannot accept offers."; }
        return;
    }

    // Cap check before accepting
    const capUsed = getCapUsed(playerTeam);
    const salaryIn = offer.theyGive.filter(a => a.type === "player").reduce((s, a) => s + calcMarketSalary(a.player), 0);
    const salaryOut = offer.theyWant.filter(a => a.type === "player").reduce((s, a) => s + (a.player.contract_salary || 0), 0);
    if (capUsed + salaryIn - salaryOut > SALARY_CAP) {
        const resultEl = document.getElementById("trade-result");
        if (resultEl) { resultEl.className = "trade-result trade-result--rejected"; resultEl.textContent = "⚠ Cannot accept — would exceed salary cap."; }
        return;
    }
    executeTrade(offer.offeringTeam, offer.theyGive, playerTeam, offer.theyWant);
    pendingTradeOffers.splice(tradeScreenState.selectedIncoming, 1);
    renderDraftPicksBadge();
    renderTradeNotification();

    const resultEl = document.getElementById("trade-result");
    if (resultEl) { resultEl.className = "trade-result trade-result--accepted"; resultEl.textContent = "✓ Trade accepted!"; }
    setTimeout(() => { tradeScreenState.mode = "hub"; renderTradeScreen(); }, 1200);
}

function declineIncomingTrade() {
    pendingTradeOffers.splice(tradeScreenState.selectedIncoming, 1);
    renderTradeNotification();
    tradeScreenState.mode = "hub";
    renderTradeScreen();
}

// Generate a college player for a specific round
function generateProspect(round) {
    const player = new Player();
    player.name = generateName();
    player.age = 21;
    player.contract_length = 4;
    player.contract_value = 0;

    const positions = POSITIONS_POOL;
    player.position = positions[randrange(0, positions.length - 1)];
    player.unit = getUnit(player.position);

    const [minStat, maxStat] = ROUND_STAT_RANGES[round];

    // Core stats get round-appropriate ranges
    player.strength = ratgInRange(minStat, maxStat);
    player.speed = ratgInRange(minStat, maxStat);
    player.stamina = ratgInRange(minStat, maxStat);
    player.accuracy = ratgInRange(minStat, maxStat);
    player.tackling = ratgInRange(minStat, maxStat);
    player.catching = ratgInRange(minStat, maxStat);
    player.blocking = ratgInRange(minStat, maxStat);

    player.draftRound = round;
    return player;
}

// Assign draft picks to teams based on standings (worst record = pick #1)
// Called at END of season (before reset) to snapshot standings for draft order
function captureDraftOrder() {
    // Sort worst to best by win%, then fewest points scored as tiebreak
    const sorted = [...allteams].sort((a, b) => {
        const aGP = a.wins + a.losses;
        const bGP = b.wins + b.losses;
        // Teams with 0 games get random order
        if (aGP === 0 && bGP === 0) return Math.random() - 0.5;
        const aWin = aGP > 0 ? a.wins / aGP : 0;
        const bWin = bGP > 0 ? b.wins / bGP : 0;
        if (Math.abs(aWin - bWin) > 0.001) return aWin - bWin; // lower win% picks first
        return a.pf - b.pf; // tiebreak: fewer points scored
    });

    // Store each team's pick slot (1 = worst, 32 = best)
    for (let i = 0; i < sorted.length; i++) {
        sorted[i]._draftSlot = i + 1; // 1 = first pick, worst team
    }

    return sorted;
}

function assignDraftPicks(draftOrder) {
    // draftOrder is pre-captured before reset, sorted worst→best
    // Separate current-year fromTrade picks (being used now) from future-year traded picks (keep for later)
    const tradedPicks = {}; // current year traded picks
    const futureTradedPicks = {}; // future year traded picks (futureYear > 0)
    for (const team of allteams) {
        const allTraded = (team.draftPicks || []).filter(p => p.fromTrade);
        // Future picks: futureYear is decremented each season; if > 1 keep waiting, if 1 they redeem this season
        tradedPicks[team.name] = allTraded.filter(p => !p.futureYear || p.futureYear <= 0);
        futureTradedPicks[team.name] = allTraded.filter(p => p.futureYear > 0);
    }

    // Reset all picks
    for (const team of allteams) {
        team.draftPicks = [];
    }

    // Track which base current-year picks have been traded away
    const tradedAwayBase = {};
    for (const team of allteams) {
        tradedAwayBase[team.name] = new Set();
    }

    for (const team of allteams) {
        for (const pk of tradedPicks[team.name]) {
            const origTeam = draftOrder[pk.pick - 1];
            if (origTeam && origTeam.name !== team.name) {
                tradedAwayBase[origTeam.name].add(`${pk.round}-${pk.pick}`);
            }
        }
    }

    // Assign current-year base picks
    for (let round = 1; round <= DRAFT_ROUNDS; round++) {
        for (let i = 0; i < draftOrder.length; i++) {
            const pickNum = (round - 1) * draftOrder.length + (i + 1);
            const team = draftOrder[i];
            const key = `${round}-${i + 1}`;
            if (!tradedAwayBase[team.name].has(key)) {
                team.draftPicks.push({ round, pick: i + 1, overall: pickNum, futureYear: 0 });
            }
        }
    }

    // Restore current-year traded picks
    for (const team of allteams) {
        for (const pk of tradedPicks[team.name]) {
            team.draftPicks.push({ round: pk.round, pick: pk.pick, overall: pk.overall, fromTrade: true, futureYear: 0 });
        }
    }

    // Restore future picks — decrement their futureYear by 1 (they're one year closer now)
    for (const team of allteams) {
        for (const pk of futureTradedPicks[team.name]) {
            team.draftPicks.push({ ...pk, futureYear: pk.futureYear - 1 });
        }
    }

    // Add future year picks (year+1, year+2) as tradeable assets for all teams
    // These are "own" future picks teams haven't traded away yet
    for (let futYr = 1; futYr <= 2; futYr++) {
        for (let round = 1; round <= DRAFT_ROUNDS; round++) {
            for (const team of allteams) {
                // Check if this future pick was already traded away
                const alreadyTraded = allteams.some(other =>
                    other !== team &&
                    (other.draftPicks || []).some(pk =>
                        pk.fromTrade && pk.futureYear === futYr &&
                        pk.round === round && pk._origTeam === team.name
                    )
                );
                if (!alreadyTraded) {
                    team.draftPicks.push({ round, pick: 0, overall: 0, futureYear: futYr, _origTeam: team.name });
                }
            }
        }
    }

    return draftOrder;
}

// Generate all prospects for the draft
function generateProspects(numTeams) {
    const prospects = [];
    for (let round = 1; round <= DRAFT_ROUNDS; round++) {
        // Generate more prospects than picks so there's choice
        const picksThisRound = numTeams;
        const extraProspects = Math.floor(picksThisRound * 1.5);
        for (let i = 0; i < picksThisRound + extraProspects; i++) {
            prospects.push(generateProspect(round));
        }
    }
    // Sort by overall descending so top picks are clearer
    prospects.sort((a, b) => b.overall() - a.overall());
    return prospects;
}

// CPU auto-pick logic: pick the best available player that fills a need
function cpuAutoPick(team, available, round) {
    // Determine needs
    const positionCounts = {};
    for (const p of team.players) {
        positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
    }

    const needs = {
        QB: 1 - (positionCounts["QB"] || 0),
        K: 1 - (positionCounts["K"] || 0),
        RB: 1 - (positionCounts["RB"] || 0),
        WR: 2 - (positionCounts["WR"] || 0),
        TE: 1 - (positionCounts["TE"] || 0),
        OL: 2 - (positionCounts["OL"] || 0),
        DL: 2 - (positionCounts["DL"] || 0),
        LB: 2 - (positionCounts["LB"] || 0),
        DB: 2 - (positionCounts["DB"] || 0),
    };

    // Filter prospects from this round
    const roundProspects = available.filter(p => p.draftRound === round);
    if (!roundProspects.length) return available[0]; // fallback

    // Score each prospect: overall + need bonus
    let bestScore = -1;
    let bestPick = roundProspects[0];

    for (const p of roundProspects) {
        const need = needs[p.position] || 0;
        const needBonus = need > 0 ? 2 : 0;
        const score = p.overall() + needBonus + Math.random() * 1.5; // small randomness
        if (score > bestScore) {
            bestScore = score;
            bestPick = p;
        }
    }
    return bestPick;
}

// Build the flat pick list for the entire draft
function buildPickList(draftOrder) {
    const pickList = [];
    for (let round = 1; round <= DRAFT_ROUNDS; round++) {
        // Collect all picks in this round from all teams (teams may have 0, 1, or 2+ via trades)
        const roundPicks = [];
        for (const team of draftOrder) {
            // Only use current-year picks (futureYear === 0 or undefined) in the draft board
            const teamPicks = team.draftPicks.filter(p => p.round === round && (p.futureYear || 0) === 0);
            for (const pk of teamPicks) {
                roundPicks.push({ team, round, pick: pk.pick, overall: pk.overall });
            }
        }
        // Sort by pick slot within the round
        roundPicks.sort((a, b) => a.pick - b.pick);
        pickList.push(...roundPicks);
    }
    return pickList;
}

// Start the draft — draftOrder is pre-captured before season reset
function startDraft(draftOrder) {
    const order = assignDraftPicks(draftOrder);
    draftState.prospects = generateProspects(allteams.length);
    draftState.pickList = buildPickList(order);
    draftState.currentPickIdx = 0;
    draftState.draftLog = [];
    draftState.active = true;
    draftState.showRoster = false;

    // Find which pick index is the player team
    const playerTeam = allteams.find(t => t.playerTeam);
    draftState.playerPickIdx = draftState.pickList.findIndex(p => p.team === playerTeam);

    renderDraftScreen();
    advanceDraftToCurrent();
}

// ─── CPU ROSTER TRIMMING ─────────────────────────────────────────────
// Called after the draft AND once per week during the season.
// Cuts surplus players from CPU rosters using the Team method, which
// respects minimums per position so no team is left without a QB etc.
// ─────────────────────────────────────────────────────────────────────
function cpuTrimRosters() {
    for (const team of allteams) {
        if (team.playerTeam) continue;
        // Keep cutting while there's surplus (safety cap of 30 iterations)
        let safety = 0;
        while (team.surplusCount() > 0 && safety < 30) {
            safety++;
            if (!team.cpuCutWorstSurplus()) break;
        }
    }
}

// Render the roster panel inside the draft screen
function renderDraftRosterPanel() {
    const playerTeam = allteams.find(t => t.playerTeam);
    if (!playerTeam) return "";

    const posOrder = ["QB", "RB", "WR", "TE", "OL", "K", "DL", "LB", "DB"];
    const grouped = {};
    for (const pos of posOrder) grouped[pos] = [];
    for (const p of playerTeam.sortedPlayers()) {
        if (grouped[p.position]) grouped[p.position].push(p);
    }

    const offDepth = playerTeam.offenseDepth();
    const defDepth = playerTeam.defenseDepth();

    let html = `<div class="draft-roster-panel" id="draft-roster-panel">
        <div class="draft-section-title" style="display:flex;justify-content:space-between;align-items:center;">
            <span>MY ROSTER</span>
            <button onclick="toggleDraftRoster()" style="font-size:10px;padding:2px 8px;margin:0;">✕</button>
        </div>
        <div class="draft-roster-depth">
            <span class="depth-pill ${offDepth.score >= 7 ? 'depth-good' : offDepth.score >= 4 ? 'depth-ok' : 'depth-bad'}">OFF ${offDepth.score}</span>
            <span class="depth-pill ${defDepth.score >= 7 ? 'depth-good' : defDepth.score >= 4 ? 'depth-ok' : 'depth-bad'}">DEF ${defDepth.score}</span>
        </div>`;

    for (const pos of posOrder) {
        const players = grouped[pos];
        const needs = { QB:1, K:1, RB:1, WR:2, TE:1, OL:2, DL:2, LB:2, DB:2 };
        const need = needs[pos] || 1;
        const hasEnough = players.length >= need;

        html += `<div class="draft-roster-group">
            <div class="draft-roster-pos-header ${hasEnough ? '' : 'draft-roster-need'}">
                ${pos} <span class="draft-roster-count">${players.length}</span>
                ${!hasEnough ? '<span class="draft-need-badge">NEED</span>' : ''}
            </div>`;

        if (players.length === 0) {
            html += `<div class="draft-roster-empty">—</div>`;
        } else {
            for (const p of players) {
                html += `<div class="draft-roster-player">
                    <span class="draft-roster-name">${p.name}</span>
                    <span class="draft-roster-stars">${toStars(p.overall())}</span>
                </div>`;
            }
        }
        html += `</div>`;
    }

    html += `</div>`;
    return html;
}

function toggleDraftRoster() {
    draftState.showRoster = !draftState.showRoster;
    renderDraftScreen();
}

function skipDraft() {
    while (draftState.currentPickIdx < draftState.pickList.length) {
        const current = draftState.pickList[draftState.currentPickIdx];
        const available = draftState.prospects;
        if (available.length === 0) break;
        const pick = cpuAutoPick(current.team, available, current.round);
        pick.team = current.team;
        pick.draftRound = current.round;
        pick.draftPick = current.overall;
        //I want skip draft to delete our picks if we dont need them
        //current.team.players.push(pick);
        const idx = available.indexOf(pick);
        if (idx !== -1) available.splice(idx, 1);
        draftState.draftLog.push({ overall: current.overall, round: current.round, pick: current.pick, team: current.team.name, player: pick.name, pos: pick.position, ovr: pick.overall() });
        draftState.currentPickIdx++;
    }
    draftState.active = false;
    cpuTrimRosters();
    document.getElementById("draft").style.display = "none";
    document.getElementById("menu").style.display = "block";
    renderDraftPicksBadge();
    sel.dispatchEvent(new Event("change", { bubbles: true }));
}

// Advance past all CPU picks until it's the player's turn (or draft ends)
function advanceDraftToCurrent() {
    const playerTeam = allteams.find(t => t.playerTeam);

    while (draftState.currentPickIdx < draftState.pickList.length) {
        const current = draftState.pickList[draftState.currentPickIdx];
        if (current.team === playerTeam) {
            renderDraftScreen();
            return;
        }

        const available = draftState.prospects;
        if (available.length === 0) break;

        const pick = cpuAutoPick(current.team, available, current.round);
        pick.team = current.team;
        pick.draftRound = current.round;
        pick.draftPick = current.overall;
        current.team.players.push(pick);

        const idx = available.indexOf(pick);
        if (idx !== -1) available.splice(idx, 1);

        draftState.draftLog.push({
            overall: current.overall,
            round: current.round,
            pick: current.pick,
            team: current.team.name,
            player: pick.name,
            pos: pick.position,
            ovr: pick.overall(),
        });

        draftState.currentPickIdx++;
    }

    // Draft over
    draftState.active = false;
    cpuTrimRosters();
    renderDraftScreen();
    setTimeout(() => {
        document.getElementById("draft").style.display = "none";
        document.getElementById("menu").style.display = "block";
        renderDraftPicksBadge();
        sel.dispatchEvent(new Event("change", { bubbles: true }));
    }, 2500);
}

// Render the draft screen
function renderDraftScreen() {
    const el = document.getElementById("draft-content");
    if (!el) return;

    const playerTeam = allteams.find(t => t.playerTeam);
    const currentEntry = draftState.pickList[draftState.currentPickIdx];
    const isPlayerTurn = currentEntry && currentEntry.team === playerTeam;
    const isDraftOver = draftState.currentPickIdx >= draftState.pickList.length;
    const showRoster = draftState.showRoster;

    // ── Header ──
    let html = `<div class="draft-header">
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>`;

    if (isDraftOver) {
        html += `<div class="draft-title">DRAFT COMPLETE</div>
                 <div class="draft-subtitle">Returning to menu…</div>`;
    } else if (isPlayerTurn) {
        html += `<div class="draft-title">YOU'RE ON THE CLOCK</div>
                 <div class="draft-subtitle">Round ${currentEntry.round} · Pick ${currentEntry.overall} · #${currentEntry.pick} overall in round</div>`;
    } else {
        html += `<div class="draft-title">DRAFT IN PROGRESS</div>
                 <div class="draft-subtitle">${currentEntry ? `Round ${currentEntry.round} · Pick ${currentEntry.overall} — ${currentEntry.team.name}` : ""}</div>`;
    }

    html += `</div>`;
    if (!isDraftOver) {
        html += `<div style="display:flex;gap:8px;align-items:center;">`;
        html += `<button onclick="toggleDraftRoster()" class="draft-roster-btn${showRoster ? ' active' : ''}">${showRoster ? '▶ HIDE ROSTER' : '◀ MY ROSTER'}</button>`;
        html += `<button onclick="skipDraft()" style="font-size:11px;padding:7px 14px;background:transparent;border-color:var(--muted);color:var(--muted);">SKIP DRAFT</button>`;
        html += `</div>`;
    }
    html += `</div></div>`;

    // ── Draft body ──
    const bodyClass = showRoster ? "draft-body draft-body--with-roster" : "draft-body";
    html += `<div class="${bodyClass}">`;

    // Left: pick log
    html += `<div class="draft-log">
        <div class="draft-section-title">DRAFT BOARD</div>`;

    const logStart = Math.max(0, draftState.currentPickIdx - 8);
    for (let i = logStart; i < Math.min(draftState.pickList.length, draftState.currentPickIdx + 20); i++) {
        const entry = draftState.pickList[i];
        const logged = draftState.draftLog.find(l => l.overall === entry.overall);
        const isCurrent = i === draftState.currentPickIdx && !isDraftOver;
        const isPlayer = entry.team === playerTeam;

        let cls = "draft-row";
        if (isCurrent) cls += " draft-row-current";
        else if (logged) cls += isPlayer ? " draft-row-player-picked" : " draft-row-picked";
        else cls += isPlayer ? " draft-row-player-future" : " draft-row-future";

        html += `<div class="${cls}">
            <span class="draft-row-pick">${entry.round}.${String(entry.pick).padStart(2, "0")}</span>
            <span class="draft-row-team">${entry.team.name}</span>
            ${logged ? `<span class="draft-row-player">${logged.pos} ${logged.player}</span><span class="draft-row-stars">${toStars(logged.ovr)}</span>` : isCurrent ? `<span class="draft-row-onclock">ON THE CLOCK</span>` : ""}
        </div>`;
    }
    html += `</div>`;

    // Middle: prospects / my picks
    if (isPlayerTurn) {
        const roundProspects = draftState.prospects
            .filter(p => p.draftRound === currentEntry.round)
            .slice(0, 30);

        html += `<div class="draft-prospects">
            <div class="draft-section-title">AVAILABLE — ROUND ${currentEntry.round}</div>`;

        for (const p of roundProspects) {
            const idx = draftState.prospects.indexOf(p);
            html += `<div class="draft-prospect-card" onclick="playerDraftPick(${idx})">
                <span class="draft-prospect-pos">${p.position}</span>
                <span class="draft-prospect-name">${p.name}</span>
                <span class="draft-prospect-stars">${toStars(p.overall())}</span>
                <span class="draft-prospect-attrs">STR ${p.strength} · SPD ${p.speed} · STA ${p.stamina}</span>
            </div>`;
        }
        html += `</div>`;
    } else {
        const myPicks = draftState.draftLog.filter(l => l.team === (playerTeam ? playerTeam.name : ""));
        html += `<div class="draft-prospects">
            <div class="draft-section-title">${playerTeam ? playerTeam.name.toUpperCase() + " PICKS" : "MY PICKS"}</div>`;

        if (myPicks.length === 0) {
            html += `<div class="draft-empty">No picks yet</div>`;
        } else {
            for (const pick of myPicks) {
                html += `<div class="draft-prospect-card draft-prospect-card--picked">
                    <span class="draft-prospect-pos">${pick.pos}</span>
                    <span class="draft-prospect-name">${pick.player}</span>
                    <span class="draft-prospect-stars">${toStars(pick.ovr)}</span>
                    <span class="draft-prospect-attrs">Round ${pick.round} · Pick #${pick.overall}</span>
                </div>`;
            }
        }
        html += `</div>`;
    }

    // Right: roster panel (if toggled)
    if (showRoster) {
        html += renderDraftRosterPanel();
    }

    html += `</div>`; // draft-body
    el.innerHTML = html;
}

// Player makes a pick
function playerDraftPick(prospectIdx) {
    if (!draftState.active) return;

    const playerTeam = allteams.find(t => t.playerTeam);
    const currentEntry = draftState.pickList[draftState.currentPickIdx];
    if (!currentEntry || currentEntry.team !== playerTeam) return;

    const pick = draftState.prospects[prospectIdx];
    if (!pick) return;

    pick.team = playerTeam;
    pick.draftRound = currentEntry.round;
    pick.draftPick = currentEntry.overall;
    // Assign rookie contract for player-team drafted players
    assignRookieContract(pick);
    playerTeam.players.push(pick);

    draftState.prospects.splice(prospectIdx, 1);

    draftState.draftLog.push({
        overall: currentEntry.overall,
        round: currentEntry.round,
        pick: currentEntry.pick,
        team: playerTeam.name,
        player: pick.name,
        pos: pick.position,
        ovr: pick.overall(),
    });

    draftState.currentPickIdx++;
    renderDraftScreen();

    // Continue CPU picks
    setTimeout(() => advanceDraftToCurrent(), 300);
}

// Show draft picks summary in the #info area
function renderDraftPicksBadge() {
    const playerTeam = allteams.find(t => t.playerTeam);
    if (!playerTeam) return;
    // Group picks by year and round for display
    const currentPicks = playerTeam.draftPicks.filter(pk => (pk.futureYear || 0) === 0);
    const picksByRound = {};
    for (const pk of currentPicks) {
        if (!picksByRound[pk.round]) picksByRound[pk.round] = [];
        picksByRound[pk.round].push(pk.pick);
    }
    let txt = `${year}: `;
    for (let r = 1; r <= DRAFT_ROUNDS; r++) {
        const picks = picksByRound[r] || [];
        txt += `R${r}:${picks.map(p => p ? `#${p}` : '✓').join(",") || "—"} `;
    }
    // Show count of future picks
    const futCount = playerTeam.draftPicks.filter(pk => (pk.futureYear || 0) > 0).length;
    if (futCount > 0) txt += ` +${futCount} future`;
    const infoEl = document.getElementById("info");
    // Update or create draft picks span
    let dpSpan = document.getElementById("info-draft-picks");
    if (!dpSpan) {
        dpSpan = document.createElement("span");
        dpSpan.id = "info-draft-picks";
        dpSpan.style.cssText = "font-size:11px; color: var(--muted); letter-spacing:0.06em;";
        infoEl.appendChild(dpSpan);
    }
    dpSpan.textContent = "DRAFT PICKS · " + txt;
}


// =====================================================================
// MATCH ENGINE
// =====================================================================

function simMatch(team1, team2) {
    const ri = (mn, mx) => Math.floor(Math.random() * (mx - mn + 1)) + mn;
    const rf = (mn, mx) => Math.random() * (mx - mn) + mn;
    const clp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
    const prob = (p) => Math.random() < p;

    const CFG = {
        basePts: 21, advantageScale: 6, maxAdvantage: 9,
        minVariance: 5, maxVariance: 18, variancePerOff: 1.2,
        blowoutChance: 0.08, blowoutBonus: 16,
        shutoutChance: 0.03, shutoutMax: 10,
        minScore: 0, maxScore: 63,
    };

    function simTeamScore(offTeam, defTeam) {
        const off = offTeam.offenseRating();
        const def = defTeam.defenseRating();
        const offPts = CFG.basePts + (off - 5) * CFG.advantageScale;
        const defSuppression = (def - 5) * CFG.advantageScale;
        const basePts = offPts - defSuppression;
        const variance = clp(CFG.minVariance + (10 - def) * CFG.variancePerOff, CFG.minVariance, CFG.maxVariance);
        const noise = rf(-variance, variance);
        const extraNoise = rf(-variance * 0.7, variance * 0.7);
        let score = basePts + noise + extraNoise;
        if (prob(CFG.blowoutChance)) score += CFG.blowoutBonus;
        if (prob(CFG.shutoutChance)) score = Math.min(score, CFG.shutoutMax);
        score = Math.round(clp(score, CFG.minScore, CFG.maxScore));
        if (score % 3 === 2 && score > 2) score += Math.random() < 0.5 ? 1 : -1;
        return score;
    }

    function simPlayerStats(offTeam, defTeam, offScore) {
        const ri = (mn, mx) => Math.floor(Math.random() * (mx - mn + 1)) + mn;
        const rf = (mn, mx) => Math.random() * (mx - mn) + mn;
        const clp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
        const prob = (p) => Math.random() < p;
        const avgStat = (players, getter) => {
            if (!players.length) return 5;
            return players.reduce((s, p) => s + getter(p), 0) / players.length;
        };
        const pickWeighted = (arr, weights) => {
            const total = weights.reduce((a, b) => a + b, 0);
            let r = Math.random() * total;
            for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i]; }
            return arr[arr.length - 1];
        };
        const get = (team, pos) => team.players.filter(p => p.position === pos);

        const QBs = get(offTeam, "QB");
        const Ks = get(offTeam, "K");
        const RBs = get(offTeam, "RB");
        const WRs = get(offTeam, "WR");
        const TEs = get(offTeam, "TE");
        const OLs = get(offTeam, "OL");
        const DLs = get(defTeam, "DL");
        const LBs = get(defTeam, "LB");
        const DBs = get(defTeam, "DB");

        const olBlocking = avgStat(OLs, p => p.blocking);
        const dlTackling = avgStat(DLs, p => p.tackling);
        const lbTackling = avgStat(LBs, p => p.tackling);
        const dbTackling = avgStat(DBs, p => p.tackling);
        const qbAccuracy = avgStat(QBs, p => p.accuracy);
        const qbSpeed = avgStat(QBs, p => p.speed);

        const passRush = clp((dlTackling * 0.6 + lbTackling * 0.4) - olBlocking * 0.5, 0, 10);
        const coverage = clp(dbTackling - qbAccuracy * 0.3, 0, 10);
        const runStop = clp((dlTackling * 0.5 + lbTackling * 0.5) - olBlocking * 0.4, 0, 10);

        const fgCount = Math.round(clp(rf(0, 1) * (offScore / 20), 0, Math.floor(offScore / 3)));
        if (Ks[0]) Ks[0].stats.fgs += fgCount;
        const fgPoints = fgCount * 3;
        const tdPoints = Math.max(0, offScore - fgPoints);
        const totalTDs = Math.max(0, Math.round(tdPoints / 7));

        const passReceivers = WRs.length + TEs.length;
        const fillerQuality = offTeam.offense_base / 3;
        const fillerSlots = Math.max(0, 3 - (WRs.length + TEs.length + RBs.length));

        const passWeight = clp((passReceivers + fillerQuality * 2) * (qbAccuracy / 5), 0.5, 5);
        const rushWeight = RBs.length > 0
            ? clp((olBlocking / 5) * 2 - runStop * 0.2 + fillerQuality, 0.2, 4)
            : clp(fillerQuality * 0.8, 0.1, 1.5);
        const qbScramWeight = clp(qbSpeed * 0.08 - passRush * 0.05, 0.05, 0.4);
        const totalTDWeight = passWeight + rushWeight + qbScramWeight;

        let passingTDs = 0, rushingTDs = 0, qbRushTDs = 0;
        for (let i = 0; i < totalTDs; i++) {
            const r = Math.random() * totalTDWeight;
            if (r < passWeight) passingTDs++;
            else if (r < passWeight + rushWeight) rushingTDs++;
            else qbRushTDs++;
        }

        const allReceivers = [
            ...WRs.map(p => ({ player: p, type: 'WR' })),
            ...TEs.map(p => ({ player: p, type: 'TE' })),
            ...RBs.map(p => ({ player: p, type: 'RB' }))
        ];

        const rawShareWeights = allReceivers.map(({ player, type }) => {
            if (type === 'WR') return clp(player.catching * 0.55 + player.speed * 0.45, 1, 10);
            if (type === 'TE') return clp(player.catching * 0.6 + player.strength * 0.25 + player.speed * 0.15, 1, 10);
            return clp(player.catching * 0.7 + player.speed * 0.3, 1, 10) * 0.45;
        });

        const rawShareSum = rawShareWeights.reduce((a, b) => a + b, 0);
        const MAX_SHARE = 0.25;
        const targetShares = rawShareWeights.map(w => Math.min(w / rawShareSum, MAX_SHARE));
        const namedShareTotal = targetShares.reduce((a, b) => a + b, 0);
        const fillerShare = Math.max(0, 1.0 - namedShareTotal);

        const passTargets = [...WRs, ...TEs, ...RBs];
        const passTDScorers = {};
        passTargets.forEach(p => passTDScorers[p.name] = 0);
        let fillerPassTDs = 0;

        for (let i = 0; i < passingTDs; i++) {
            if (!passTargets.length) { fillerPassTDs++; continue; }
            const weights = allReceivers.map(({ player, type }, idx) => {
                const abilityW = type === 'WR'
                    ? clp(player.catching * 0.7 + player.speed * 0.3, 1, 10)
                    : type === 'TE'
                        ? clp(player.catching * 0.6 + player.strength * 0.2 + player.speed * 0.2, 1, 10)
                        : clp(player.catching * 0.7 + player.speed * 0.3, 1, 10) * 0.45;
                return abilityW * targetShares[idx];
            });
            const fillerTDWeight = fillerShare * clp(fillerQuality * 1.5, 0.5, 4);
            const totalWeight = weights.reduce((a, b) => a + b, 0) + fillerTDWeight;
            let r = Math.random() * totalWeight;
            let scored = false;
            for (let j = 0; j < allReceivers.length; j++) {
                r -= weights[j];
                if (r <= 0) { passTDScorers[allReceivers[j].player.name]++; scored = true; break; }
            }
            if (!scored) fillerPassTDs++;
        }

        const rushTDScorers = {};
        RBs.forEach(p => rushTDScorers[p.name] = 0);
        for (let i = 0; i < rushingTDs; i++) {
            if (!RBs.length) continue;
            const weights = RBs.map(p => clp(p.strength * 0.6 + p.speed * 0.4, 1, 10));
            const scorer = pickWeighted(RBs, weights);
            rushTDScorers[scorer.name]++;
        }

        const effectiveRec = (WRs.length + TEs.length + RBs.length) + fillerSlots * fillerQuality;
        let totalPassYards = 0;
        let totalPassAttempts = 0;
        let totalCompletions = 0;

        const teamPassAttempts = Math.round(clp(
            rf(28, 45) + (qbAccuracy - 5) * 1.2 - passRush * 0.6, 18, 60
        ));

        function genReceiver(player, share, type) {
            const targets = Math.round(clp(teamPassAttempts * share * rf(0.88, 1.12), 0, 15));
            const isTightEnd = type === 'TE';
            const catchPct = clp(rf(0.53, 0.74) + (player.catching - 5) * 0.025 + (qbAccuracy - 5) * 0.015 - coverage * 0.018, 0.42, 0.92);
            const recs = Math.round(targets * catchPct);
            let ypcBase, ypcRange;
            if (type === 'WR') { ypcBase = 13.0; ypcRange = 7.0; }
            else if (type === 'TE') { ypcBase = 9.0; ypcRange = 4.0; }
            else { ypcBase = 4.5; ypcRange = 3.0; }
            const ypc = clp(rf(ypcBase, ypcBase + ypcRange) + (player.speed - 5) * (isTightEnd ? 0.35 : 0.60) - coverage * 0.22, isTightEnd ? 4 : 3, 22);
            const tdBonus = (passTDScorers[player.name] || 0) * rf(5, 15);
            const recYards = Math.max(recs * 5, Math.round(recs * ypc + tdBonus));
            const fumbles = prob(0.04) ? 1 : 0;
            const fumblesLost = fumbles && prob(0.45) ? 1 : 0;

            player.stats.receiving_targets += targets;
            player.stats.receptions += recs;
            player.stats.receiving_yards += recYards;
            player.stats.receiving_touchdowns += (passTDScorers[player.name] || 0);
            player.stats.fumbles += fumbles;
            player.stats.fumbles_lost += fumblesLost;
            player.stats.week[current_week] = {};
            player.stats.week[current_week].receiving_targets = targets;
            player.stats.week[current_week].receptions = recs;
            player.stats.week[current_week].receiving_yards = recYards;
            player.stats.week[current_week].receiving_touchdowns = (passTDScorers[player.name] || 0);
            player.stats.week[current_week].fumbles = fumbles;

            totalPassAttempts += targets;
            totalCompletions += recs;
            totalPassYards += recYards;
        }

        allReceivers.forEach(({ player, type }, i) => genReceiver(player, targetShares[i], type));

        const fillerAttempts = Math.round(teamPassAttempts * fillerShare * rf(0.9, 1.1));
        const fillerCompPct = clp(rf(0.52, 0.67) + (qbAccuracy - 5) * 0.02 - coverage * 0.015, 0.35, 0.82);
        const fillerComp = Math.round(fillerAttempts * fillerCompPct);
        const fillerYards = Math.round(fillerComp * clp(rf(5, 9) - coverage * 0.2, 3, 13));
        totalPassAttempts += fillerAttempts;
        totalCompletions += fillerComp;
        totalPassYards += fillerYards;

        QBs.forEach(qb => {
            const accFactor = clp(rf(0.92, 1.08) + (qb.accuracy - 5) * 0.012, 0.82, 1.18);
            const minAttempts = Math.round(clp(rf(22, 38) + (qb.accuracy - 5) * 0.8 - passRush * 0.5, 18, 50));
            const scaleFactor = totalPassAttempts < minAttempts ? (minAttempts / Math.max(totalPassAttempts, 1)) : 1.0;
            const finalAttempts = Math.round(totalPassAttempts * scaleFactor);
            const rawCompPct = totalPassAttempts > 0 ? totalCompletions / totalPassAttempts : 0.60;
            const adjCompPct = clp(rawCompPct * accFactor + 0.05, 0.52, 0.78);
            const finalComp = Math.round(finalAttempts * adjCompPct);
            const finalYards = Math.round(totalPassYards * scaleFactor * accFactor);
            const intBase = rf(0, 2.5) + passRush * 0.18 - qb.accuracy * 0.15;
            const ints = Math.round(clp(intBase, 0, 5));
            const scrambles = Math.round(clp(rf(0, 2) + qb.speed * 0.15 - passRush * 0.15, 0, 6));
            const scrambleYds = Math.round(scrambles * clp(rf(4, 9) + qb.speed * 0.3, 2, 16));
            const fumbles = prob(passRush > 7 ? 0.25 : 0.08) ? 1 : 0;
            const fumblesLost = fumbles && prob(0.45) ? 1 : 0;

            qb.stats.attempts += finalAttempts; qb.stats.completions += finalComp;
            qb.stats.passing_yards += finalYards; qb.stats.passing_touchdowns += passingTDs;
            qb.stats.passing_interceptions += ints; qb.stats.rushing_attempts += scrambles;
            qb.stats.rushing_yards += scrambleYds; qb.stats.rushing_touchdowns += qbRushTDs;
            qb.stats.fumbles += fumbles; qb.stats.fumbles_lost += fumblesLost;

            qb.stats.week[current_week] = {};
            qb.stats.week[current_week].attempts = finalAttempts;
            qb.stats.week[current_week].completions = finalComp;
            qb.stats.week[current_week].passing_yards = finalYards;
            qb.stats.week[current_week].passing_touchdowns = passingTDs;
            qb.stats.week[current_week].passing_interceptions = ints;
            qb.stats.week[current_week].rushing_attempts = scrambles;
            qb.stats.week[current_week].rushing_yards = scrambleYds;
            qb.stats.week[current_week].rushing_touchdowns = qbRushTDs;
            qb.stats.week[current_week].fumbles = fumbles;
            qb.stats.week[current_week].fumbles_lost = fumblesLost;
        });

        if (RBs.length) {
            const rb = RBs[0];
            const carries = Math.round(clp(rf(20, 35) + (rb.strength - 5) * 0.6 - runStop * 0.4, 10, 40) * rf(0.85, 1.15));
            const ypc = clp(rf(3.5, 5.0) + (rb.speed - 5) * 0.35 + (rb.strength - 5) * 0.25 + (olBlocking - 5) * 0.08 - runStop * 0.20, 2.0, 8.5);
            const tdYardBonus = (rushTDScorers[rb.name] || 0) * rf(3, 8);
            const rushYards = Math.round(carries * ypc + tdYardBonus);
            const fumbles = prob(runStop > 7 ? 0.12 : 0.05) ? 1 : 0;
            const fumblesLost = fumbles && prob(0.45) ? 1 : 0;

            rb.stats.rushing_attempts += carries; rb.stats.rushing_yards += rushYards;
            rb.stats.rushing_touchdowns += (rushTDScorers[rb.name] || 0);
            rb.stats.fumbles += fumbles; rb.stats.fumbles_lost += fumblesLost;

            rb.stats.week[current_week] = rb.stats.week[current_week] || {};
            rb.stats.week[current_week].rushing_attempts = carries;
            rb.stats.week[current_week].rushing_yards = rushYards;
            rb.stats.week[current_week].rushing_touchdowns = (rushTDScorers[rb.name] || 0);
            rb.stats.week[current_week].fumbles = fumbles;
        }

        DLs.forEach(dl => {
            const pressure = clp(dl.tackling * 0.5 + dl.strength * 0.5 - olBlocking * 0.5, 0, 10);
            const sacks = prob(pressure > 7 ? 0.55 : pressure > 4 ? 0.35 : 0.15) ? ri(1, 3) : 0;
            const tackles = Math.round(clp(rf(1, 5) + pressure * 0.4, 0, 10));
            dl.stats.sacks += sacks; dl.stats.tackles_solo += tackles;
            dl.stats.week[current_week] = {};
            dl.stats.week[current_week].sacks = sacks;
            dl.stats.week[current_week].tackles_solo = tackles;
        });

        LBs.forEach(lb => {
            const rushPressure = clp(lb.tackling * 0.5 + lb.strength * 0.5 - olBlocking * 0.4, 0, 10);
            const tackles = Math.round(clp(rf(2, 8) + lb.tackling * 0.5, 1, 14));
            const sacks = prob(rushPressure > 6 ? 0.40 : 0.15) ? ri(1, 2) : 0;
            lb.stats.tackles_solo += tackles; lb.stats.sacks += sacks;
            lb.stats.week[current_week] = {};
            lb.stats.week[current_week].tackles_solo = tackles;
            lb.stats.week[current_week].sacks = sacks;
        });

        const wrCatching = avgStat(WRs, p => p.catching);
        DBs.forEach(db => {
            const covAbility = clp(db.tackling * 0.5 + db.speed * 0.5 - qbAccuracy * 0.2 - wrCatching * 0.2, 0, 10);
            const tackles = Math.round(clp(rf(1, 6) + db.tackling * 0.3, 0, 10));
            db.stats.tackles_solo += tackles;
            db.stats.week[current_week] = {};
            db.stats.week[current_week].tackles_solo = tackles;
        });

        QBs.forEach(qb => {
            const qbInts = qb.stats.week[current_week]?.passing_interceptions || 0;
            const allDBLB = [...DBs, ...LBs];
            for (let i = 0; i < qbInts; i++) {
                if (!allDBLB.length) break;
                const weights = allDBLB.map(p => {
                    const covAbility = clp(p.tackling * 0.5 + p.speed * 0.5 - qbAccuracy * 0.2, 0, 10);
                    return covAbility + 1;
                });
                const scorer = pickWeighted(allDBLB, weights);
                scorer.stats.interceptions++;
                scorer.stats.week[current_week] = scorer.stats.week[current_week] || {};
                scorer.stats.week[current_week].interceptions = (scorer.stats.week[current_week].interceptions || 0) + 1;
            }
        });
    }

    const t1score = simTeamScore(team1, team2);
    const t2score = simTeamScore(team2, team1);
    simPlayerStats(team1, team2, t1score);
    simPlayerStats(team2, team1, t2score);

    team1.players.forEach(p => { p.stats.games_played++; p.stats.games_started++; });
    team2.players.forEach(p => { p.stats.games_played++; p.stats.games_started++; });

    let finalT1 = t1score, finalT2 = t2score;
    if (finalT1 === finalT2) {
        if (Math.random() < 0.5) finalT1 += 7;
        else finalT2 += 7;
    }

    if (finalT1 > finalT2) { team1.wins++; team2.losses++; }
    else { team2.wins++; team1.losses++; }

    team1.pf += finalT1; team1.pa += finalT2;
    team2.pf += finalT2; team2.pa += finalT1;

    const winner = finalT1 > finalT2 ? team1 : team2;

    team1.results = team1.results || [];
    team2.results = team2.results || [];
    team1.results.push({ opponent: team2, pf: finalT1, pa: finalT2, win: finalT1 > finalT2 });
    team2.results.push({ opponent: team1, pf: finalT2, pa: finalT1, win: finalT2 > finalT1 });

    return [winner, finalT1, finalT2];
}

function undoMatchRecord(t1, t2, result) {
    const winner = result[0];
    const loser = winner === t1 ? t2 : t1;
    winner.wins--; loser.losses--;
    winner.pf -= result[1]; winner.pa -= result[2];
    loser.pf -= result[2]; loser.pa -= result[1];
}

var year = 2026;
var season_schedule = [];
var current_week = 0;
var playoff_afc = [];
var playoff_nfc = [];
var awdstxt = "";

function cont() {
    // Sync settings to globals
    SALARY_CAP = gameSettings.salaryCap;
    TRADE_DEADLINE_WEEK = gameSettings.tradeDeadlineWeek;
    var playoffs = current_week >= 17;

    if (!playoffs) {
        const weekGames = season_schedule[current_week];
        var tt = "";
        tt += `=== WEEK ${current_week + 1} ===<br>`;
        for (let i = 0; i < weekGames.length; i++) {
            const team1 = weekGames[i][0];
            const team2 = weekGames[i][1];
            const result = simMatch(team1, team2);
            tt += `${team1.name} ${result[1]} - ${result[2]} ${team2.name} | ${result[0].name} wins <br>`;
        }
        // CPU roster management: trim surplus players each week
        cpuTrimRosters();
        // Maybe generate a CPU trade offer this week
        maybeCpuTradeOffer();
        // Update morale based on win/loss
        const playerTeam = allteams.find(t => t.playerTeam);
        if (playerTeam) {
            const playerGame = weekGames.find(g => g[0] === playerTeam || g[1] === playerTeam);
            if (playerGame) {
                const r = playerTeam.results?.[playerTeam.results.length - 1];
                if (r) updatePlayerMorale(playerTeam, r.win);
            }
            // Check for player demands after morale update
            checkPlayerDemands(playerTeam);
        }
    } else {
        if (current_week === 17) {
            function calcFantasyPoints(player) {
                const s = renderSeasonStats(player);
                let pts = 0;
                pts += s.passing_touchdowns * 4;
                pts += Math.floor(s.passing_yards / 25);
                pts += s.passing_interceptions * -1;
                pts += s.rushing_touchdowns * 6;
                pts += Math.floor(s.rushing_yards / 10);
                pts += s.receiving_touchdowns * 6;
                pts += Math.floor(s.receiving_yards / 10);
                pts += s.receptions * 1;
                return pts;
            }
            function calcDefPoints(player) {
                const s = renderSeasonStats(player);
                let pts = 0;
                pts += s.tackles_solo * 1;
                pts += s.sacks * 4;
                pts += s.interceptions * 6;
                return pts;
            }

            const allPlayers = allteams.flatMap(t => t.players);
            const qbs = allPlayers.filter(p => p.position === "QB");
            const skill = allPlayers.filter(p => ["WR", "RB", "TE"].includes(p.position));
            const def = allPlayers.filter(p => ["DL", "LB", "DB"].includes(p.position));

            const mvp = qbs.sort((a, b) => calcFantasyPoints(b) - calcFantasyPoints(a))[0];
            const opoy = skill.sort((a, b) => calcFantasyPoints(b) - calcFantasyPoints(a))[0];
            const dpoy = def.sort((a, b) => calcDefPoints(b) - calcDefPoints(a))[0];

            mvp.awards = mvp.awards || []; mvp.awards.push("MVP " + year);
            opoy.awards = opoy.awards || []; opoy.awards.push("OPOY " + year);
            dpoy.awards = dpoy.awards || []; dpoy.awards.push("DPOY " + year);

            awdstxt = `=== SEASON AWARDS ===<br>
    🏆 MVP: ${mvp.name} (${mvp.team?.name ?? "?"}) — ${calcFantasyPoints(mvp)} fantasy pts<br>
    ⚡ OPOY: ${opoy.name} (${opoy.team?.name ?? "?"}) — ${calcFantasyPoints(opoy)} fantasy pts<br>
    🛡️ DPOY: ${dpoy.name} (${dpoy.team?.name ?? "?"}) — ${calcDefPoints(dpoy)} def pts<br>`;

            let afc = allteams.filter(t => t.conference === "afc");
            let nfc = allteams.filter(t => t.conference === "nfc");
            afc.sort((a, b) => b.wins - a.wins || b.ties - a.ties || a.losses - b.losses);
            nfc.sort((a, b) => b.wins - a.wins || b.ties - a.ties || a.losses - b.losses);
            afc = afc.slice(0, 7);
            nfc = nfc.slice(0, 7);

            playoff_afc = [afc[0]];
            playoff_nfc = [nfc[0]];

            var tt = "";
            tt += (`=== WILD CARD ROUND ===<br>`);
            tt += (`${afc[0].name} has a BYE<br>`);
            tt += (`${nfc[0].name} has a BYE<br>`);

            const wildcards = [[1, 6], [2, 5], [3, 4]];
            const afcWCWinners = [];
            for (const [a, b] of wildcards) {
                const result = simMatch(afc[a], afc[b]);
                undoMatchRecord(afc[a], afc[b], result);
                tt += (`AFC: ${afc[a].name} ${result[1]} - ${result[2]} ${afc[b].name} | ${result[0].name} wins<br>`);
                // Tag the playoff result with the round name for the player team
                [afc[a], afc[b]].forEach(t => { if (t.playerTeam && t.results?.length) t.results[t.results.length - 1].playoffRound = "WILD CARD"; });
                afcWCWinners.push({ team: result[0], seed: result[0] === afc[a] ? a : b });
            }
            afcWCWinners.sort((a, b) => a.seed - b.seed);
            afcWCWinners.forEach(w => playoff_afc.push(w.team));

            const nfcWCWinners = [];
            for (const [a, b] of wildcards) {
                const result = simMatch(nfc[a], nfc[b]);
                undoMatchRecord(nfc[a], nfc[b], result);
                tt += (`NFC: ${nfc[a].name} ${result[1]} - ${result[2]} ${nfc[b].name} | ${result[0].name} wins<br>`);
                [nfc[a], nfc[b]].forEach(t => { if (t.playerTeam && t.results?.length) t.results[t.results.length - 1].playoffRound = "WILD CARD"; });
                nfcWCWinners.push({ team: result[0], seed: result[0] === nfc[a] ? a : b });
            }
            nfcWCWinners.sort((a, b) => a.seed - b.seed);
            nfcWCWinners.forEach(w => playoff_nfc.push(w.team));

            logWeek(tt);
        } else if (current_week === 18) {
            var tt = "";
            tt += (`=== DIVISIONAL ROUND ===<br>`);
            const divMatchups = [[0, 3], [1, 2]];
            const nextAFC = [], nextNFC = [];
            for (const [a, b] of divMatchups) {
                const result = simMatch(playoff_afc[a], playoff_afc[b]);
                undoMatchRecord(playoff_afc[a], playoff_afc[b], result);
                tt += (`AFC: ${playoff_afc[a].name} ${result[1]} - ${result[2]} ${playoff_afc[b].name} | ${result[0].name} wins<br>`);
                [playoff_afc[a], playoff_afc[b]].forEach(t => { if (t.playerTeam && t.results?.length) t.results[t.results.length - 1].playoffRound = "DIVISIONAL"; });
                nextAFC.push(result[0]);
            }
            for (const [a, b] of divMatchups) {
                const result = simMatch(playoff_nfc[a], playoff_nfc[b]);
                undoMatchRecord(playoff_nfc[a], playoff_nfc[b], result);
                tt += (`NFC: ${playoff_nfc[a].name} ${result[1]} - ${result[2]} ${playoff_nfc[b].name} | ${result[0].name} wins<br>`);
                [playoff_nfc[a], playoff_nfc[b]].forEach(t => { if (t.playerTeam && t.results?.length) t.results[t.results.length - 1].playoffRound = "DIVISIONAL"; });
                nextNFC.push(result[0]);
            }
            playoff_afc = nextAFC;
            playoff_nfc = nextNFC;
            logWeek(tt);
        } else if (current_week === 19) {
            var tt = "";
            tt += (`=== CONFERENCE CHAMPIONSHIPS ===<br>`);
            const afcResult = simMatch(playoff_afc[0], playoff_afc[1]);
            undoMatchRecord(playoff_afc[0], playoff_afc[1], afcResult);
            tt += (`AFC Championship: ${playoff_afc[0].name} ${afcResult[1]} - ${afcResult[2]} ${playoff_afc[1].name} | ${afcResult[0].name} wins<br>`);
            [playoff_afc[0], playoff_afc[1]].forEach(t => { if (t.playerTeam && t.results?.length) t.results[t.results.length - 1].playoffRound = "CONF CHAMP"; });
            const nfcResult = simMatch(playoff_nfc[0], playoff_nfc[1]);
            undoMatchRecord(playoff_nfc[0], playoff_nfc[1], nfcResult);
            tt += (`NFC Championship: ${playoff_nfc[0].name} ${nfcResult[1]} - ${nfcResult[2]} ${playoff_nfc[1].name} | ${nfcResult[0].name} wins<br>`);
            [playoff_nfc[0], playoff_nfc[1]].forEach(t => { if (t.playerTeam && t.results?.length) t.results[t.results.length - 1].playoffRound = "CONF CHAMP"; });
            playoff_afc = [afcResult[0]];
            playoff_nfc = [nfcResult[0]];
            logWeek(tt);
        } else if (current_week === 20) {
            var tt = "";
            tt += (`=== SUPER BOWL ===<br>`);
            const result = simMatch(playoff_afc[0], playoff_nfc[0]);
            undoMatchRecord(playoff_afc[0], playoff_nfc[0], result);
            tt += (`SUPER BOWL: ${playoff_afc[0].name} ${result[1]} - ${result[2]} ${playoff_nfc[0].name} | 🏆 ${result[0].name} wins the Super Bowl!<br>`);
            [playoff_afc[0], playoff_nfc[0]].forEach(t => { if (t.playerTeam && t.results?.length) t.results[t.results.length - 1].playoffRound = "SUPER BOWL"; });
            tt += awdstxt;
            logWeek(tt);
            current_week++;
            renderSchedule();
            document.getElementById("schedule").scrollLeft += 200;
            return;
        } else if (current_week > 20) {
            // Season over — capture standings BEFORE reset, then run draft
            // Snapshot draft order now while wins/losses are still set
            const preDraftOrder = captureDraftOrder();

            current_week = 0;
            awdstxt = "";
            playoff_afc = [];
            playoff_nfc = [];

            const playerTeamRef = allteams.find(t => t.playerTeam);

            for (let tm of allteams) {
                tm.wins = 0; tm.losses = 0; tm.ties = 0; tm.pf = 0; tm.pa = 0;
                tm.schedule = []; tm.results = [];

                for (let pl of tm.players) {
                    pl.stats.week = [];
                    const agingMult = gameSettings.agingSpeed || 1;
                    const num = randrange(1, 3);
                    if (pl.age > 32) {
                        const declines = Math.round(num * agingMult);
                        for (let i = 0; i < declines; i++) {
                            const stat = randrange(0, 2);
                            if (stat === 0) pl.stamina -= 1;
                            else if (stat === 1) pl.speed -= 1;
                            else pl.strength -= 1;
                        }
                    }
                    if (pl.age < 28) {
                        for (let i = 0; i < num; i++) {
                            const stat = randrange(0, 2);
                            if (stat === 0) pl.stamina += 1;
                            else if (stat === 1) pl.speed += 1;
                            else pl.strength += 1;
                        }
                    }
                    pl.stamina = clamp(pl.stamina, 1, 10);
                    pl.speed = clamp(pl.speed, 1, 10);
                    pl.strength = clamp(pl.strength, 1, 10);
                    pl.age++;

                    // Decrement contract years for player team players
                    if (tm.playerTeam && pl.contract_years_left > 0) {
                        pl.contract_years_left--;
                    }
                }
                // Reset morale + increment loyalty for player team
                if (tm.playerTeam) {
                    endSeasonMoraleReset(tm);
                }

                // Remove retired players (age > retirement setting) after aging
                const retAge = gameSettings.retirementAge || 35;
                tm.players = tm.players.filter(pl => pl.age <= retAge);
            }

            year++;
            season_schedule = [];
            generateSchedule();

            // Show re-sign screen before draft if there are expiring contracts
            goMenu();
            const hasExpiring = playerTeamRef && playerTeamRef.players.some(p => p.contract_years_left <= 0);
            if (hasExpiring) {
                setTimeout(() => {
                    document.getElementById("menu").style.display = "none";
                    document.getElementById("office").style.display = "block";
                    renderOfficeScreen();
                    // Start resign process — after it closes, launch draft
                    resignState._onComplete = () => {
                        document.getElementById("office").style.display = "none";
                        document.getElementById("draft").style.display = "flex";
                        startDraft(preDraftOrder);
                    };
                    startResignProcess();
                }, 100);
            } else {
                setTimeout(() => {
                    document.getElementById("menu").style.display = "none";
                    document.getElementById("draft").style.display = "flex";
                    startDraft(preDraftOrder);
                }, 100);
            }
            return;
        }

        sel.dispatchEvent(new Event("change", { bubbles: true }));
    }

    var top10 = {
        "pass yards": [], "passing td": [], "rushing yards": [], "rushing td": [],
        "receiving yards": [], "receiving td": [], "sacks": [], "interceptions": [], "tackles": []
    };

    for (let tt of allteams) {
        for (let ppp of tt.players) {
            let pass_yards = 0, pass_td = 0, rush_yards = 0, rush_td = 0,
                rec_yards = 0, rec_td = 0, sacks = 0, interceptions = 0, tackles = 0;
            for (let wek of ppp.stats.week) {
                if (!wek) continue;
                pass_yards += wek.passing_yards ?? 0;
                pass_td += wek.passing_touchdowns ?? 0;
                rush_yards += wek.rushing_yards ?? 0;
                rush_td += wek.rushing_touchdowns ?? 0;
                rec_yards += wek.receiving_yards ?? 0;
                rec_td += wek.receiving_touchdowns ?? 0;
                sacks += wek.sacks ?? 0;
                interceptions += wek.interceptions ?? 0;
                tackles += wek.tackles_solo ?? 0;
            }
            const statMap = [
                { key: "pass yards", val: pass_yards },
                { key: "passing td", val: pass_td },
                { key: "rushing yards", val: rush_yards },
                { key: "rushing td", val: rush_td },
                { key: "receiving yards", val: rec_yards },
                { key: "receiving td", val: rec_td },
                { key: "sacks", val: sacks },
                { key: "interceptions", val: interceptions },
                { key: "tackles", val: tackles },
            ];
            for (const { key, val } of statMap) {
                let list = top10[key];
                if (list.length < 10) {
                    list.push({ player: ppp, val });
                    list.sort((a, b) => b.val - a.val);
                } else if (val > list[9].val) {
                    list.pop();
                    list.push({ player: ppp, val });
                    list.sort((a, b) => b.val - a.val);
                }
            }
        }
    }

    const leadersContainer = document.getElementById("leaders");
    leadersContainer.innerHTML = "";
    let leadersNav = document.createElement("div");
    leadersNav.id = "leaders-nav";
    leadersContainer.appendChild(leadersNav);
    let firstCard = null;

    for (let stat in top10) {
        top10[stat].sort((a, b) => b.val - a.val);
        const btn = document.createElement("button");
        btn.textContent = stat.toUpperCase();
        btn.dataset.stat = stat;
        leadersNav.appendChild(btn);
        const dv = document.createElement("div");
        dv.dataset.stat = stat;
        dv.innerHTML = `<h3>${stat}</h3>`;
        for (let i = 0; i < top10[stat].length; i++) {
            const entry = top10[stat][i];
            dv.innerHTML += `<div><span>${i + 1}. ${entry.player.name} (${entry.player.team?.name ?? "?"})</span><span>${entry.val}</span></div>`;
        }
        leadersContainer.appendChild(dv);
        if (!firstCard) firstCard = dv;
    }

    if (firstCard) {
        firstCard.classList.add("active");
        leadersNav.firstChild.classList.add("active");
    }

    leadersNav.addEventListener("click", function (e) {
        const btn = e.target.closest("button");
        if (!btn) return;
        const stat = btn.dataset.stat;
        document.querySelectorAll("#leaders > div[data-stat]").forEach(d => d.classList.remove("active"));
        document.querySelectorAll("#leaders-nav button").forEach(b => b.classList.remove("active"));
        document.querySelector(`#leaders > div[data-stat="${stat}"]`).classList.add("active");
        btn.classList.add("active");
    });

    sel.dispatchEvent(new Event("change", { bubbles: true }));
    renderSchedule();
    document.getElementById("schedule").scrollLeft += 200;
    current_week++;
    renderDivisionBoxes();
    console.log(`--- End of Week ${current_week} ---`);

    const afc = [...allteams].filter(t => t.conference === "afc").sort((a, b) => b.wins - a.wins || b.ties - a.ties || a.losses - b.losses);
    const nfc = [...allteams].filter(t => t.conference === "nfc").sort((a, b) => b.wins - a.wins || b.ties - a.ties || a.losses - b.losses);

    function conferenceHTML(teams, label) {
        let html = `<div><strong>${label}</strong></div>`;
        teams.forEach((team, i) => {
            const rank = i + 1;
            const classes = [rank <= 7 ? "playoff-team" : "", team.playerTeam ? "player-team" : ""].filter(Boolean).join(" ");
            html += `<div class="${classes}">${rank}. ${team.name} ${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""} (PF ${team.pf}, PA ${team.pa})</div>`;
        });
        return html;
    }

    document.getElementById("playoffpicture").innerHTML = conferenceHTML(afc, "AFC") + conferenceHTML(nfc, "NFC");

    var mc = document.getElementById("teamdata");
    if (mc && allteams.find(t => t.playerTeam)) {
        const pt = allteams.find(t => t.playerTeam);
        const offRanked = [...allteams].sort((a, b) => (b.pf / Math.max(b.wins + b.losses, 1)) - (a.pf / Math.max(a.wins + a.losses, 1)));
        const defRanked = [...allteams].sort((a, b) => (a.pa / Math.max(a.wins + a.losses, 1)) - (b.pa / Math.max(b.wins + b.losses, 1)));
        const offRank = offRanked.findIndex(t => t === pt) + 1;
        const defRank = defRanked.findIndex(t => t === pt) + 1;
        const gp = Math.max(pt.wins + pt.losses, 1);
        const ppg = (pt.pf / gp).toFixed(1);
        const papg = (pt.pa / gp).toFixed(1);
        const half = allteams.length / 2;
        const rankClass = (rank) => rank <= half ? "teamdata-green" : "teamdata-red";
        const avgOff = allteams.reduce((s, t) => s + t.offenseRating(), 0) / allteams.length;
        const avgDef = allteams.reduce((s, t) => s + t.defenseRating(), 0) / allteams.length;
        const avgOffDepth = allteams.reduce((s, t) => s + t.offenseDepth().score, 0) / allteams.length;
        const avgDefDepth = allteams.reduce((s, t) => s + t.defenseDepth().score, 0) / allteams.length;

        mc.innerHTML = `
        <div class="teamdata-row">
            <div class="teamdata-cell">
                <span class="teamdata-label">OFF RTG</span>
                <span class="teamdata-value ${pt.offenseRating() >= avgOff ? "teamdata-green" : "teamdata-red"}">${pt.offenseRating()}</span>
            </div>
            <div class="teamdata-cell">
                <span class="teamdata-label">DEF RTG</span>
                <span class="teamdata-value ${pt.defenseRating() >= avgDef ? "teamdata-green" : "teamdata-red"}">${pt.defenseRating()}</span>
            </div>
            <div class="teamdata-cell">
                <span class="teamdata-label">OFF DEPTH</span>
                <span class="teamdata-value ${pt.offenseDepth().score >= avgOffDepth ? "teamdata-green" : "teamdata-red"}">${pt.offenseDepth().score}</span>
            </div>
            <div class="teamdata-cell">
                <span class="teamdata-label">DEF DEPTH</span>
                <span class="teamdata-value ${pt.defenseDepth().score >= avgDefDepth ? "teamdata-green" : "teamdata-red"}">${pt.defenseDepth().score}</span>
            </div>
        </div>
        <div class="teamdata-row">
            <div class="teamdata-cell">
                <span class="teamdata-label">PPG</span>
                <span class="teamdata-value ${rankClass(offRank)}">${ppg}</span>
                <span class="teamdata-rank">#${offRank}</span>
            </div>
            <div class="teamdata-cell">
                <span class="teamdata-label">OPP PPG</span>
                <span class="teamdata-value ${rankClass(defRank)}">${papg}</span>
                <span class="teamdata-rank">#${defRank}</span>
            </div>
        </div>`;
    }

    // Update draft picks badge
    renderDraftPicksBadge();
}

function generateSchedule() {
    const n = allteams.length;
    const teams = [...allteams].sort(() => Math.random() - 0.5);
    const rotating = teams.slice(1);
    const rounds = [];

    for (let round = 0; round < n - 1; round++) {
        const roundGames = [];
        const circle = [teams[0], ...rotating];
        for (let i = 0; i < n / 2; i++) roundGames.push([circle[i], circle[n - 1 - i]]);
        rounds.push(roundGames);
        rotating.unshift(rotating.pop());
    }

    for (let i = rounds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rounds[i], rounds[j]] = [rounds[j], rounds[i]];
    }

    for (let week = 0; week < 17; week++) season_schedule[week] = rounds[week % rounds.length];

    for (let week = 0; week < 17; week++) {
        for (const [t1, t2] of season_schedule[week]) {
            if (!t1.schedule) t1.schedule = [];
            if (!t2.schedule) t2.schedule = [];
            t1.schedule.push({ opponent: t2, week });
            t2.schedule.push({ opponent: t1, week });
        }
    }
}

function renderSchedule() {
    const playerTeam = allteams.find(t => t.playerTeam);
    if (!playerTeam) return;

    const el = document.getElementById("schedule");
    el.innerHTML = "";

    let currentFound = false;
    for (let i = 0; i < 17; i++) {
        const game = playerTeam.schedule?.[i];
        if (!game) continue;
        const result = playerTeam.results?.[i];
        const isPlayed = !!result;
        let isCurrent = false;
        if (!isPlayed && !currentFound) { isCurrent = true; currentFound = true; }

        const card = document.createElement("div");
        card.className = "schedule-card" +
            (isCurrent ? " schedule-current" : "") +
            (isPlayed ? (result.win ? " schedule-win" : " schedule-loss") : "");

        card.innerHTML = `
            <span class="schedule-week">WK ${i + 1}</span>
            <span class="schedule-opp">${game.opponent.name}</span>
            <span class="schedule-opp">${game.opponent.wins}-${game.opponent.losses}<br>
            ${isPlayed ? `<span class="schedule-result">${result.pf}-${result.pa}</span>` : ""}`;
        el.appendChild(card);
    }

    const playoffResults = (playerTeam.results || []).slice(17);
    if (current_week >= 17 || playoffResults.length > 0) {
        const divider = document.createElement("div");
        divider.className = "schedule-divider";
        divider.textContent = "PLAYOFFS";
        el.appendChild(divider);
    }

    playoffResults.forEach((result, idx) => {
        // Use the stored round name (set when simulated) to avoid off-by-one with bye weeks
        const roundName = result.playoffRound || `RD ${idx + 1}`;
        const card = document.createElement("div");
        const isCurrentPlayoff = (idx + 17 === current_week);
        card.className = "schedule-card schedule-playoff" +
            (isCurrentPlayoff ? " schedule-current" : "") +
            (result.win ? " schedule-win" : " schedule-loss");
        card.innerHTML = `
            <span class="schedule-week">${roundName}</span>
            <span class="schedule-opp">${result.opponent.name}</span>
            <span class="schedule-result">${result.pf}–${result.pa}</span>`;
        el.appendChild(card);
    });
}

window.onload = function () {
    display("afc");
    generateLeague();
    generateSchedule();
    document.getElementById("contt").style.display = "none";
    document.getElementById("pickteam").addEventListener("click", function () {
        document.getElementById("contt").style.display = "block";
        var tm = document.getElementById("teamselect").value;
        const chosenTeam = allteams[tm];
        chosenTeam.playerTeam = true;
        // Assign initial contracts to all players on the chosen team
        for (const pl of chosenTeam.players) {
            assignInitialContract(pl);
        }
        document.getElementById("pickteam").style.display = "none";
        renderSchedule();
        renderDraftPicksBadge();
        renderOfficeScreen();
    });
};