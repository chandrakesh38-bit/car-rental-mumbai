const mobileOtpReady = import('/assets/js/mobile-otp.js').catch(() => null);

        const SUPABASE_URL = "https://pwciaihqkfnlenxxiown.supabase.co";
        const SUPABASE_ANON_KEY = "sb_publishable_ZhQ7lv3YVC96tsNg_NoDuA_bxXHrbGz";
        const supabasePublic = (window.supabase && typeof window.supabase.createClient === 'function') ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

        // Public pricing is database-backed so CWD Admin changes are reflected without code deploys.
        const livePricingRules = {
            baseDeliveryCharge: 500,
            extraDeliveryChargePerKm: 25,
            freeThresholdKm: 25,
            driverNightAllowance: 500,
            minimumOutstationKmPerDay: 300,
        };

        function pricingRuleKey(name) {
            const n = String(name || '').toLowerCase();
            if (n.includes('base') && n.includes('delivery')) return 'baseDeliveryCharge';
            if (n.includes('extra') && n.includes('delivery')) return 'extraDeliveryChargePerKm';
            if (n.includes('threshold')) return 'freeThresholdKm';
            if (n.includes('night') && n.includes('allowance')) return 'driverNightAllowance';
            if (n.includes('minimum') && n.includes('outstation')) return 'minimumOutstationKmPerDay';
            return null;
        }

        async function loadPublicPricingRules() {
            if (!supabasePublic) return;
            const { data, error } = await supabasePublic.from('pricing_rules').select('rule_name,rule_value');
            if (error || !data) return;
            data.forEach(rule => {
                const key = pricingRuleKey(rule.rule_name);
                const value = Number(rule.rule_value);
                if (key && Number.isFinite(value) && value >= 0) livePricingRules[key] = value;
            });
            if (document.getElementById('booking-widget')) {
                calculateDriverFare();
                if (selectedCarObj) updateSDFareReview();
            }
        }

        async function loadPublicFaqs() {
            const accordion = document.getElementById('faq-accordion');
            if (!accordion || !supabasePublic) return;
            const { data, error } = await supabasePublic.from('faqs').select('id,question,answer,display_order,is_active').eq('is_active', true).order('display_order', { ascending: true });
            if (error || !data) return;
            accordion.innerHTML = '';
            data.forEach((faq, index) => {
                const item = document.createElement('div');
                item.className = (index >= 3 ? 'hidden faq-more ' : '') + 'bg-white border border-slate-200 rounded-xl p-4 shadow-sm';
                const heading = document.createElement('h4');
                heading.className = 'font-bold text-sm text-slate-900 mb-1.5 flex items-center gap-2';
                const icon = document.createElement('i');
                icon.className = 'fa-solid fa-circle-question text-indigo-600';
                heading.append(icon, document.createTextNode(' ' + faq.question));
                const answer = document.createElement('p');
                answer.className = 'text-xs text-slate-600 leading-relaxed pl-5';
                answer.textContent = faq.answer;
                item.append(heading, answer);
                accordion.appendChild(item);
            });
            const toggle = document.getElementById('faq-toggle-btn');
            if (toggle) toggle.classList.toggle('hidden', data.length <= 3);
        }

        document.addEventListener('DOMContentLoaded', () => {
            loadPublicPricingRules();
            loadPublicLocationConfig();
            loadPublicFaqs();
        });

let mumbaiPlaces = [];

        let destinationCities = [
            { name: "Pune", km: 300 }, { name: "Nashik", km: 340 }, { name: "Nagpur", km: 1650 }, 
            { name: "Kolhapur", km: 780 }, { name: "Satara", km: 500 }, { name: "Solapur", km: 820 }, 
            { name: "Sangli", km: 760 }, { name: "Aurangabad / Chhatrapati Sambhajinagar", km: 680 }, 
            { name: "Ahmednagar / Ahilyanagar", km: 500 }, { name: "Ratnagiri", km: 660 }, 
            { name: "Sindhudurg", km: 980 }, { name: "Nanded", km: 1150 }, { name: "Jalgaon", km: 820 }, 
            { name: "Amravati", km: 1350 }, { name: "Lonavala", km: 170 }, { name: "Mahabaleshwar", km: 520 }, 
            { name: "Shirdi", km: 480 }, { name: "Alibag", km: 220 }, { name: "Trimbakeshwar", km: 360 }, 
            { name: "Goa", km: 1200 }, { name: "Surat", km: 580 }, { name: "Palghar", km: 200 },
            { name: "Matheran", km: 190 }, { name: "Khandala", km: 175 }, { name: "Ganpatipule", km: 700 },
            { name: "Dapoli", km: 450 }, { name: "Bhandardara", km: 320 }, { name: "Malshej Ghat", km: 260 },
            { name: "Pandharpur", km: 720 }, { name: "Tuljapur", km: 900 }, { name: "Shani Shingnapur", km: 540 },
            { name: "Chandrapur", km: 1550 }, { name: "Buldhana", km: 950 }, { name: "Vadodara", km: 850 }, { name: "Vapi", km: 350 },
            { name: "Silvassa", km: 380 }, { name: "Indore", km: 1100 }
            ];

let mumbaiMetroLocations = [
    { name: "Vikhroli", km: 1, serviceable: true },
    { name: "Powai", km: 2, serviceable: true },    
    { name: "Bhandup", km: 4, serviceable: true },
    { name: "Kanjur Marg", km: 4, serviceable: true },
    { name: "Nahur", km: 5, serviceable: true },
    { name: "Vidyavihar", km: 5, serviceable: true },
    { name: "Ghatkopar", km: 6, serviceable: true },
    { name: "Mulund", km: 7, serviceable: true },
    { name: "Kurla", km: 9, serviceable: true },
    { name: "Sakinaka", km: 9, serviceable: true },    
    { name: "Digha Gaon", km: 10, serviceable: true },
    { name: "Lokmanya Tilak Terminus", km: 10, serviceable: true },
    { name: "Govandi", km: 12, serviceable: true },
    { name: "Guru Tegh Bahadur Nagar", km: 12, serviceable: true },
    { name: "Sion", km: 12, serviceable: true },
    { name: "Thane", km: 12, serviceable: true },
    { name: "Tilak Nagar", km: 12, serviceable: true },
    { name: "Airoli", km: 13, serviceable: true },
    { name: "Chembur", km: 13, serviceable: true },
    { name: "Kalwa", km: 13, serviceable: true },
    { name: "Chunabhatti", km: 14, serviceable: true },
    { name: "Mankhurd", km: 14, serviceable: true },
    { name: "Andheri", km: 15, serviceable: true },
    { name: "King's Circle", km: 15, serviceable: true },
    { name: "Matunga", km: 15, serviceable: true },
    { name: "Mumbra", km: 15, serviceable: true },
    { name: "Rabale", km: 15, serviceable: true },
    { name: "Vile Parle", km: 15, serviceable: true },
    { name: "Cotton Green", km: 16, serviceable: true },
    { name: "Dadar", km: 16, serviceable: true },
    { name: "Jogeshwari", km: 16, serviceable: true },
    { name: "Matunga Road", km: 16, serviceable: true },
    { name: "Santacruz", km: 16, serviceable: true },
    { name: "Sewri", km: 16, serviceable: true },
    { name: "Wadala Road", km: 16, serviceable: true },
    { name: "Currey Road", km: 17, serviceable: true },
    { name: "Diva Junction", km: 17, serviceable: true },
    { name: "Ghansoli", km: 17, serviceable: true },
    { name: "Khar Road", km: 17, serviceable: true },
    { name: "Mahim Junction", km: 17, serviceable: true },
    { name: "Prabhadevi", km: 17, serviceable: true },
    { name: "Bandra", km: 18, serviceable: true },
    { name: "Chinchpokli", km: 18, serviceable: true },
    { name: "Parel", km: 18, serviceable: true },
    { name: "Ram Mandir", km: 18, serviceable: true },
    { name: "Reay Road", km: 18, serviceable: true },
    { name: "Bandra Terminus", km: 19, serviceable: true },
    { name: "Byculla", km: 19, serviceable: true },
    { name: "Goregaon", km: 19, serviceable: true },
    { name: "Koparkhairane", km: 19, serviceable: true },
    { name: "Lower Parel", km: 19, serviceable: true },
    { name: "Chhatrapati Shivaji Maharaj Terminus", km: 20, serviceable: true },
    { name: "Dockyard Road", km: 20, serviceable: true },
    { name: "Mahalaxmi", km: 20, serviceable: true },
    { name: "Masjid", km: 20, serviceable: true },
    { name: "Sandhurst Road", km: 20, serviceable: true },
    { name: "Grant Road", km: 21, serviceable: true },
    { name: "Kopar", km: 21, serviceable: true },
    { name: "Marine Lines", km: 21, serviceable: true },
    { name: "Mumbai Central", km: 21, serviceable: true },
    { name: "Turbhe", km: 21, serviceable: true },
    { name: "Charni Road", km: 22, serviceable: true },
    { name: "Malad", km: 22, serviceable: true },
    { name: "Nilaje", km: 22, serviceable: true },
    { name: "Churchgate", km: 23, serviceable: true },
    { name: "Ambivli", km: 24, serviceable: true },
    { name: "Dativali", km: 24, serviceable: true },
    { name: "Dombivli", km: 24, serviceable: true },
    { name: "Kandivli", km: 24, serviceable: true },
    { name: "Vashi", km: 25, serviceable: true },
    { name: "Ambarnath", km: 26, serviceable: true },
    { name: "Dahisar", km: 26, serviceable: true },
    { name: "Sanpada", km: 26, serviceable: true },
    { name: "Ulhasnagar", km: 26, serviceable: true },
    { name: "Shahad", km: 27, serviceable: true },
    { name: "Juinagar", km: 28, serviceable: true },
    { name: "Bhiwandi Road", km: 29, serviceable: true },
    { name: "Borivali", km: 29, serviceable: true },
    { name: "Kharbav", km: 29, serviceable: true },
    { name: "Vithalwadi", km: 29, serviceable: true },
    { name: "Mira Road", km: 31, serviceable: true },
    { name: "Nerul", km: 31, serviceable: true },
    { name: "Seawoods-Darave-Karave", km: 32, serviceable: true },
    { name: "Kalyan Junction", km: 33, serviceable: true },
    { name: "Badlapur", km: 34, serviceable: true },
    { name: "Kaman Road", km: 34, serviceable: true },
    { name: "Naigaon", km: 34, serviceable: true },
    { name: "CBD Belapur", km: 35, serviceable: true },
    { name: "Bhayandar", km: 36, serviceable: true },
    { name: "Kharghar", km: 36, serviceable: true },
    { name: "Mansarovar", km: 36, serviceable: true },
    { name: "Titwala", km: 36, serviceable: true },
    { name: "Nallasopara", km: 37, serviceable: true },
    { name: "Juchandra", km: 38, serviceable: true },
    { name: "Khandeshwar", km: 38, serviceable: true },
    { name: "Bamangdongri", km: 41, serviceable: true },
    { name: "Kalamboli", km: 41, serviceable: true },
    { name: "Kharkopar", km: 41, serviceable: true },
    { name: "Taloje Panchnand", km: 43, serviceable: true },
    { name: "Chouk", km: 44, serviceable: true },
    { name: "Gavan", km: 44, serviceable: true },
    { name: "Khadavli", km: 44, serviceable: true },
    { name: "Panvel", km: 44, serviceable: true },
    { name: "Vasind", km: 44, serviceable: true },
    { name: "Navde Road", km: 45, serviceable: true },
    { name: "Chikhli", km: 46, serviceable: true },
    { name: "Dolavli", km: 46, serviceable: true },
    { name: "Vasai Road", km: 46, serviceable: true },
    { name: "Chikhale", km: 48, serviceable: true },
    { name: "Dronagiri", km: 48, serviceable: true },
    { name: "Nhava Sheva", km: 48, serviceable: true },
    { name: "Asangaon", km: 50, serviceable: true },
    { name: "Poyanje", km: 50, serviceable: true },
    { name: "Somatne", km: 50, serviceable: true },
    { name: "Vangani", km: 50, serviceable: true },
    { name: "Virar", km: 50, serviceable: true },

    { name: "Targahar", km: null, serviceable: false },
    { name: "Uran", km: null, serviceable: false },
    { name: "Rasayani", km: null, serviceable: false },
    { name: "Kelavli", km: null, serviceable: false },
    { name: "Apta", km: null, serviceable: false },
    { name: "Pen", km: null, serviceable: false },
    { name: "Shelu", km: null, serviceable: false },
    { name: "Atgaon", km: null, serviceable: false },
    { name: "Jite", km: null, serviceable: false },
    { name: "Lowjee", km: null, serviceable: false },
    { name: "Thansit", km: null, serviceable: false },
    { name: "Vaitarna", km: null, serviceable: false },
    { name: "Hamrapur", km: null, serviceable: false },
    { name: "Neral Junction", km: null, serviceable: false },
    { name: "Bhivpuri Road", km: null, serviceable: false },
    { name: "Nidi", km: null, serviceable: false },
    { name: "Kasu", km: null, serviceable: false },
    { name: "Nagothane", km: null, serviceable: false },
    { name: "Palasdhari", km: null, serviceable: false },
    { name: "Saphale", km: null, serviceable: false },
    { name: "Karjat", km: null, serviceable: false },
    { name: "Khardi", km: null, serviceable: false },
    { name: "Boisar", km: null, serviceable: false },
    { name: "Umbermali", km: null, serviceable: false },
    { name: "Khopoli", km: null, serviceable: false },
    { name: "Palghar", km: null, serviceable: false },
    { name: "Aman Lodge", km: null, serviceable: false },
    { name: "Umroli", km: null, serviceable: false },
    { name: "Jummapatti", km: null, serviceable: false },
    { name: "Water Pipe", km: null, serviceable: false },
    { name: "Matheran", km: null, serviceable: false },
    { name: "Kasara", km: null, serviceable: false },
    { name: "Roha", km: null, serviceable: false },
    { name: "Kelve Road", km: null, serviceable: false },
    { name: "Vangaon", km: null, serviceable: false },
    { name: "Bordi Road", km: null, serviceable: false },
    { name: "Gholvad", km: null, serviceable: false },
    { name: "Dahanu Road", km: null, serviceable: false }
];
        mumbaiPlaces = mumbaiMetroLocations.map(location => location.name);

        mumbaiMetroLocations = mumbaiMetroLocations.map(location => ({
            ...location,
            active: true,
            localPickup: true,
            outstationPickup: true,
            airportArea: true,
            selfDriveDelivery: location.serviceable !== false && Number.isFinite(location.km)
        }));
        destinationCities = destinationCities.map(location => ({ ...location, active: true }));
        let localPickupPlaces = mumbaiMetroLocations.filter(l => l.active !== false && l.localPickup).map(l => l.name);
        let outstationPickupPlaces = mumbaiMetroLocations.filter(l => l.active !== false && l.outstationPickup).map(l => l.name);
        let airportAreaPlaces = mumbaiMetroLocations.filter(l => l.active !== false && l.airportArea).map(l => l.name);
        mumbaiPlaces = localPickupPlaces;

        function refreshLocationLists() {
            localPickupPlaces = mumbaiMetroLocations.filter(l => l.active !== false && l.localPickup).map(l => l.name);
            outstationPickupPlaces = mumbaiMetroLocations.filter(l => l.active !== false && l.outstationPickup).map(l => l.name);
            airportAreaPlaces = mumbaiMetroLocations.filter(l => l.active !== false && l.airportArea).map(l => l.name);
            mumbaiPlaces = localPickupPlaces;
        }

        async function loadPublicLocationConfig() {
            try {
                const response = await fetch('/api/location-config', { cache: 'no-store' });
                const payload = await response.json();
                if (!response.ok || !payload?.success || !payload?.config) return;
                const metro = Array.isArray(payload.config.metro) ? payload.config.metro : [];
                const destinations = Array.isArray(payload.config.destinations) ? payload.config.destinations : [];
                if (metro.length) {
                    mumbaiMetroLocations = metro.map(location => ({
                        name: String(location.name || '').trim(),
                        km: location.distanceKm == null ? null : Number(location.distanceKm),
                        serviceable: location.active !== false && location.selfDriveDelivery === true,
                        city: String(location.city || '').trim(),
                        state: String(location.state || 'Maharashtra').trim(),
                        active: location.active !== false,
                        localPickup: location.localPickup === true,
                        outstationPickup: location.outstationPickup === true,
                        airportArea: location.airportArea === true,
                        selfDriveDelivery: location.selfDriveDelivery === true
                    })).filter(location => location.name);
                    refreshLocationLists();
                }
                if (destinations.length) {
                    destinationCities = destinations
                        .filter(location => location.active !== false)
                        .map(location => ({ name: String(location.name || '').trim(), km: Number(location.roundTripKm), active: true }))
                        .filter(location => location.name && Number.isFinite(location.km) && location.km > 0);
                    onWDDestinationInput();
                }
            } catch (_) {
                // Keep bundled fallback lists if the config endpoint is unavailable.
            }
        }

        // 6 WITH DRIVER CARS
        let wdFleet = [
            { name: 'Sedan (Dzire / Aura)', category: 'Comfort Sedan', seats: '4+1', bags: '2 Bags', rates: { local: { '8hr_80km': 3000, '10hr_100km': 3500, '12hr_120km': 4000, extraKm: 17 }, outstationPerKm: 17, driverAllowance: 500, airport: { t1: 1500, t2: 1600, nmia: 2000 } } },
            { name: 'Maruti Ertiga', category: 'Family MUV', seats: '6+1', bags: '3 Bags', rates: { local: { '8hr_80km': 3750, '10hr_100km': 4400, '12hr_120km': 5000, extraKm: 19 }, outstationPerKm: 19, driverAllowance: 500, airport: { t1: 2200, t2: 2400, nmia: 2800 } } },
            { name: 'Kia Carens', category: 'Premium Family MUV', seats: '6+1', bags: '3 Bags', rates: { local: { '8hr_80km': 4000, '10hr_100km': 4700, '12hr_120km': 5400, extraKm: 20 }, outstationPerKm: 20, driverAllowance: 500, airport: { t1: 2400, t2: 2600, nmia: 3000 } } },
            { name: 'Toyota Innova', category: 'Executive MUV', seats: '6+1', bags: '4 Bags', rates: { local: { '8hr_80km': 4400, '10hr_100km': 5200, '12hr_120km': 6000, extraKm: 22 }, outstationPerKm: 22, driverAllowance: 500, airport: { t1: 2700, t2: 2900, nmia: 3400 } } },
            { name: 'Innova Crysta', category: 'Luxury MUV', seats: '6+1', bags: '4 Bags', rates: { local: { '8hr_80km': 5000, '10hr_100km': 6000, '12hr_120km': 7000, extraKm: 25 }, outstationPerKm: 25, driverAllowance: 500, airport: { t1: 3000, t2: 3200, nmia: 3800 } } }
        ];


        function withDriverPublicName(row) {
            const name = String(row.full_name || '').trim();
            if (String(row.segment || '').toLowerCase() === 'sedan' && /dzire|aura/i.test(name)) return 'Sedan (Dzire / Aura)';
            return name;
        }

        async function loadWithDriverRatesPublic() {
            if (!supabasePublic) return;
            const { data, error } = await supabasePublic.from('with_driver_rates').select('*').eq('is_active', true).order('display_order', { ascending: true }).order('full_name', { ascending: true });
            if (error || !data?.length) return;
            const seen = new Set();
            wdFleet = data.map(row => {
                const name = withDriverPublicName(row);
                const key = name.toLowerCase();
                if (seen.has(key)) return null;
                seen.add(key);
                const local8 = Number(row.local_pkg_8hr_80km) || 0;
                const extraHour = Number(row.local_extra_hour_rate) || 0;
                return {
                    name,
                    category: row.segment || 'With Driver',
                    seats: `${Number(row.seating_capacity) || 4}+1`,
                    bags: `${Number(row.bag_capacity) || 0} Bags`,
                    rates: {
                        local: {
                            '8hr_80km': local8,
                            '10hr_100km': local8 + (extraHour * 2),
                            '12hr_120km': local8 + (extraHour * 4),
                            extraKm: Number(row.local_extra_km_rate) || 0
                        },
                        outstationPerKm: Number(row.outstation_rate_per_km) || 0,
                        driverAllowance: Number(row.driver_allowance_per_day) || 0,
                        airport: {
                            t1: Number(row.airport_t1_rate) || 0,
                            t2: Number(row.airport_t2_rate) || 0,
                            nmia: Number(row.airport_nmia_rate) || 0
                        }
                    }
                };
            }).filter(Boolean);
            if (document.getElementById('fleet-container')) renderWDFleet();
        }

        document.addEventListener('DOMContentLoaded', loadWithDriverRatesPublic);

        // Supabase vehicles is the source of truth; never restore deleted cars from a fallback.
        let excelCarsData = [];

        function escapeFleetHTML(value) {
            return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        }

        function fleetImageURL(value) {
            try { const url = new URL(value); if (['http:', 'https:'].includes(url.protocol)) return url.href; } catch (_) {}
            return '/logo.png';
        }

        let fleetRequest;
        function loadWebsiteFleet() {
            if (fleetRequest) return fleetRequest;
            fleetRequest = fetchWebsiteFleet().finally(() => { fleetRequest = null; });
            return fleetRequest;
        }

        async function fetchWebsiteFleet() {
            const grid = document.getElementById('selfdrive-cars-grid');
            const landing = document.getElementById('mumbai-selfdrive-fleet');
            const status = message => {
                for (const container of [grid, landing].filter(Boolean)) {
                    container.innerHTML = '<p class="col-span-full py-12 text-center text-slate-400 font-medium" role="status"></p>';
                    container.firstChild.textContent = message;
                }
            };
            // Let the original synchronous booking initializer finish before showing loading state.
            await Promise.resolve();
            status('Loading fleet…');
            try {
                const rows = [];
                const columns = 'id,brand,model,full_name,segment,service_type,transmission,fuel_type,seating_capacity,rate_per_hour,refundable_deposit,image_url,display_order,is_active';
                for (let offset = 0; ; offset += 500) {
                    const query = new URLSearchParams({select: columns, is_active: 'eq.true', service_type: 'in.(Self-Drive,Both)', order: 'display_order.asc,id.asc', limit: '500', offset: String(offset)});
                    const response = await fetch(`${SUPABASE_URL}/rest/v1/vehicles?${query}`, {headers: {apikey: SUPABASE_ANON_KEY}, cache: 'no-store', signal: AbortSignal.timeout(15000)});
                    if (!response.ok) throw new Error('Fleet request failed');
                    const batch = await response.json();
                    if (!Array.isArray(batch)) throw new Error('Invalid fleet response');
                    rows.push(...batch);
                    if (batch.length < 500) break;
                }
                excelCarsData = rows.filter(row => row.is_active === true && ['Self-Drive', 'Both'].includes(row.service_type)).map(row => {
                    const rate = Number(row.rate_per_hour), deposit = Number(row.refundable_deposit), seats = Number(row.seating_capacity);
                    if (row.rate_per_hour == null || row.refundable_deposit == null || !Number.isFinite(rate) || rate < 0 || !Number.isFinite(deposit) || deposit < 0 || !Number.isInteger(seats) || seats < 1) throw new Error('Invalid vehicle pricing or seats');
                    return {id: row.id, brand: row.brand || '', model: row.model || '', fullName: row.full_name || `${row.brand} ${row.model}`, segment: row.segment || '', transmission: row.transmission || '', fuel: row.fuel_type || '', seats,
                        rateVal: rate, rateHour: `₹${rate}/hour`, depositVal: deposit, deposit: `₹${deposit.toLocaleString('en-IN')}`, imgUrl: fleetImageURL(row.image_url), priority: Number(row.display_order) || 0,
                        // Preserve the existing featured ranks without adding a database column.
                        bestSelling: [1, 2, 3, 6, 7, 8, 9, 10, 11].includes(Number(row.display_order))};
                });
                if (grid) {
                    for (const [id, field] of [['brand','brand'],['fuel','fuel'],['transmission','transmission'],['seats','seats'],['segment','segment']]) {
                        const select = document.getElementById('sd-filter-' + id);
                        const selected = select.value;
                        const values = [...new Set(excelCarsData.map(car => String(car[field])))].filter(Boolean);
                        // Retain the existing filter choices and add new catalog values.
                        for (const value of values) if (![...select.options].some(option => option.value === value)) select.add(new Option(value, value));
                        select.value = selected;
                    }
                    applyAllSDFilters();
                }
                if (landing) {
                    const featured = [];
                    for (const segment of ['Hatchback', 'Compact SUV', 'MUV / 7-Seater']) {
                        const car = excelCarsData.find(car => car.segment === segment);
                        if (car) featured.push(car);
                    }
                    for (const car of excelCarsData) if (featured.length < 3 && !featured.includes(car)) featured.push(car);
                    landing.innerHTML = featured.map(car => `<article class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <img src="${escapeFleetHTML(car.imgUrl)}" alt="${escapeFleetHTML(car.fullName)} — ${escapeFleetHTML(car.segment)} in our Mumbai self-drive fleet" width="640" height="400" loading="lazy" decoding="async" class="w-full h-48 sm:h-52 object-cover bg-slate-100">
                        <div class="p-5"><p class="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-2">Self drive · ${escapeFleetHTML(car.segment)}</p><h3 class="font-extrabold text-lg text-slate-900">${escapeFleetHTML(car.fullName)}</h3><p class="text-sm text-slate-500 mt-2">${car.seats} seats · ${escapeFleetHTML(car.transmission)} · ${escapeFleetHTML(car.fuel)}</p></div></article>`).join('');
                    if (!featured.length) status('No self-drive cars are currently available.');
                }
            } catch (error) {
                excelCarsData = [];
                filteredSDCarsList = [];
                status('Unable to load the fleet. Please try again.');
                for (const container of [grid, landing].filter(Boolean)) {
                    const retry = document.createElement('button');
                    retry.type = 'button'; retry.textContent = 'Retry';
                    retry.className = 'col-span-full text-center text-indigo-900 font-bold py-3';
                    retry.onclick = () => loadWebsiteFleet(); container.appendChild(retry);
                }
            }
        }

        let currentMainMode = 'withdriver';
        let currentWDSubTab = 'outstation';
        let currentAirportType = 'drop';
        let currentOutstationJourneyType = '';
        const OUTSTATION_BASE_ADDRESS = 'Lal Bahadur Shastri Marg, Godrej Hillside Colony, Vikhroli West, Mumbai, Maharashtra 400079';
        const OUTSTATION_DRIVER_ALLOWANCE_PER_DAY = 500;
        let wdOutstationKm = 0;
        let wdOutstationDays = 1;
        let wdOutstationRouteQuote = null;
        let outstationRouteSequence = 0;
        let outstationStopSequence = 0;
        let airportRouteQuote = null;
        const AIRPORT_MAX_METERS = 30000;
        const outstationPlaceSelections = new Map();
        const outstationSearchTimers = new Map();
        let chosenCarName = '';
        let chosenFareAmount = 0;
        let firstTripFareBeforeDiscount = 0;
        let firstTripOfferApplied = false;
        let selectedCarObj = null;
        let currentDeliveryMode = 'home';
        let withDriverCurrentLocation = null;
        let selfDriveCurrentLocation = null;
        let selfDriveDeliverySelection = null;
        let calculatedRentalHours = 0;
        let currentSDPage = 1;
        const carsPerPage = 6;
        let filteredSDCarsList = [...excelCarsData];

        // Professional Custom Alert Banner (No URL displayed)
function showCustomAlert(message) {
    const existingAlert = document.getElementById('custom-floating-alert');
    if (existingAlert) existingAlert.remove();

    const alertDiv = document.createElement('div');
    alertDiv.id = 'custom-floating-alert';

    alertDiv.className = "fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-32px)] max-w-md bg-white text-slate-800 px-4 py-3.5 rounded-2xl shadow-xl border border-slate-200 flex items-center gap-3";

    alertDiv.innerHTML = `
        <div class="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <i class="fa-solid fa-circle-exclamation text-indigo-600 text-sm"></i>
        </div>

        <div class="flex-1">
            <p class="text-sm font-semibold text-slate-800 leading-snug">
                ${message}
            </p>
        </div>

        <button aria-label="Dismiss message" type="button"
            onclick="this.parentElement.remove()"
            class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
            <i class="fa-solid fa-xmark text-sm"></i>
        </button>
    `;

    document.body.appendChild(alertDiv);

    setTimeout(() => {
        if (alertDiv) alertDiv.remove();
    }, 2000);
}

        function setServiceMode(mode) {
            currentMainMode = mode;
            const btnWD = document.getElementById('btn-mode-withdriver');
            const btnSD = document.getElementById('btn-mode-selfdrive');
            const blockWD = document.getElementById('with-driver-block');
            const blockSD = document.getElementById('self-drive-block');
            const fleetSec = document.getElementById('fleet');
            const quickPlan = document.getElementById('quick-plan-routes');

            if (mode === 'withdriver') {
                btnWD.className = "py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition tab-active shadow-sm";
                btnSD.className = "py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 flex items-center justify-center gap-2 hover:text-indigo-950 transition";
                blockWD.classList.remove('hidden');
                blockSD.classList.add('hidden');
                fleetSec.classList.remove('hidden');
                quickPlan.classList.remove('hidden');
            } else {
                btnSD.className = "py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition tab-active shadow-sm";
                btnWD.className = "py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 flex items-center justify-center gap-2 hover:text-indigo-950 transition";
                blockSD.classList.remove('hidden');
                blockWD.classList.add('hidden');
                fleetSec.classList.add('hidden');
                quickPlan.classList.add('hidden');
            }
            calculateDriverFare();
        }

        function setWDSubTab(tab) {
            currentWDSubTab = tab;
            ['local', 'outstation', 'airport'].forEach(t => {
                const btn = document.getElementById(`subtab-${t}`);
                const fields = document.getElementById(`wd-${t}-fields`);
                if (t === tab) {
                    btn.className = "py-2.5 rounded-lg transition subtab-active flex items-center justify-center gap-1.5";
                    fields.classList.remove('hidden');
                } else {
                    btn.className = "py-2.5 rounded-lg transition text-slate-600 flex items-center justify-center gap-1.5";
                    fields.classList.add('hidden');
                }
            });

            if (tab === 'outstation') {
                const pDate = document.getElementById('wd-out-pdate');
                const rDate = document.getElementById('wd-out-rdate');
            } else if (tab === 'airport') {
                setAirportTransferType('drop');
            }
            updateOutstationPricingCopy();
            calculateDriverFare();
        }

        function selectLocalPackage(pkgValue) {
            document.getElementById('wd-local-package').value = pkgValue;
            const btn8 = document.getElementById('pkg-card-8hr');
            const btn12 = document.getElementById('pkg-card-12hr');
            const chk8 = document.getElementById('pkg-check-8hr');
            const chk12 = document.getElementById('pkg-check-12hr');

            if (pkgValue === '8hr_80km') {
                btn8.className = "p-3.5 rounded-xl border-2 border-indigo-600 bg-indigo-50/50 text-left transition flex items-center justify-between";
                btn8.querySelector('span').className = "font-extrabold text-xs sm:text-sm text-indigo-950 block";
                chk8.className = "fa-solid fa-circle-check text-indigo-600 text-base";
                btn12.className = "p-3.5 rounded-xl border-2 border-slate-200 bg-white text-left transition flex items-center justify-between";
                btn12.querySelector('span').className = "font-extrabold text-xs sm:text-sm text-slate-800 block";
                chk12.className = "fa-solid fa-circle-check text-slate-300 text-base";
            } else {
                btn12.className = "p-3.5 rounded-xl border-2 border-indigo-600 bg-indigo-50/50 text-left transition flex items-center justify-between";
                btn12.querySelector('span').className = "font-extrabold text-xs sm:text-sm text-slate-800 block";
                chk12.className = "fa-solid fa-circle-check text-indigo-600 text-base";
                btn8.className = "p-3.5 rounded-xl border-2 border-slate-200 bg-white text-left transition flex items-center justify-between";
                btn8.querySelector('span').className = "font-extrabold text-xs sm:text-sm text-slate-800 block";
                chk8.className = "fa-solid fa-circle-check text-slate-300 text-base";
            }
            calculateDriverFare();
        }

        function swapOutstationLocations() {
            const fromInput = document.getElementById('wd-out-pickup');
            const toInput = document.getElementById('wd-out-destination');
            const temp = fromInput.value;
            fromInput.value = toInput.value;
            toInput.value = temp;
            onWDDestinationInput();
        }

        function setOutstationJourneyType(type) {
            if (!['one-way', 'round-trip'].includes(type)) return;
            currentOutstationJourneyType = type;
            const oneWay = document.getElementById('wd-out-one-way');
            const roundTrip = document.getElementById('wd-out-round-trip');
            const selectedClass = 'rounded-xl border-2 border-indigo-600 bg-indigo-50 px-3 py-3 text-left transition shadow-sm';
            const defaultClass = 'rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-left transition hover:border-indigo-300';
            if (oneWay) {
                oneWay.className = type === 'one-way' ? selectedClass : defaultClass;
                oneWay.setAttribute('aria-pressed', String(type === 'one-way'));
            }
            if (roundTrip) {
                roundTrip.className = type === 'round-trip' ? selectedClass : defaultClass;
                roundTrip.setAttribute('aria-pressed', String(type === 'round-trip'));
            }
            invalidateOutstationRoute(type === 'one-way'
                ? 'Choose your pickup and destination to calculate the one-way fare.'
                : 'Choose your pickup and destination to calculate the round-trip fare.');
            if (collectOutstationRouteSelections(false)) updateOutstationRouteEstimate();
            updateOutstationPricingCopy();
        }

        function updateOutstationPricingCopy() {
            const policy = document.getElementById('wd-pricing-policy-copy');
            if (!policy) return;
            policy.innerHTML = '<strong>Pricing Includes:</strong> Car rental, fuel &amp; driver allowance. ' +
                (currentWDSubTab === 'outstation'
                    ? 'Extra: tolls, parking &amp; state tax at actual cost.'
                    : 'Extra: tolls &amp; parking at actual cost.');
        }

        function setAirportTransferType(type) {
            currentAirportType = type;
            airportRouteQuote = null;
            const btnDrop = document.getElementById('btn-airport-drop');
            const btnPickup = document.getElementById('btn-airport-pickup');
            const formBox = document.getElementById('airport-dynamic-form');

            const dateTimeHTML = `
                <div class="mt-4 pt-4 border-t border-slate-200">
                    <label for="wd-airport-date" class="block text-xs font-bold text-slate-700 uppercase mb-1.5"><i class="fa-solid fa-calendar-day text-indigo-600 mr-1"></i> Pickup Date & Time *</label>
                    <div class="grid grid-cols-3 gap-1.5 booking-datetime">
                        <div class="relative">
    <input type="date" id="wd-airport-date" onclick="this.showPicker()" class="date-input-custom w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-2 text-xs font-medium outline-none cursor-pointer">
    <span aria-hidden="true" id="wd-airport-date-placeholder" class="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">
        DD/MM/YY
    </span>
</div>
                        <label for="wd-airport-hour" class="sr-only">Airport pickup hour</label>
<select id="wd-airport-hour" class="bg-slate-50 border border-slate-300 rounded-lg px-1.5 py-2 text-xs font-medium outline-none">
                            <option value="1">01:00</option><option value="2">02:00</option><option value="3">03:00</option><option value="4">04:00</option>
                            <option value="5">05:00</option><option value="6">06:00</option><option value="7">07:00</option><option value="8">08:00</option>
                            <option value="9" selected>09:00</option><option value="10">10:00</option><option value="11">11:00</option><option value="12">12:00</option>
                        </select>
                        <label for="wd-airport-ampm" class="sr-only">Airport pickup AM or PM</label>
<select id="wd-airport-ampm" class="bg-slate-50 border border-slate-300 rounded-lg px-1.5 py-2 text-xs font-bold text-indigo-950 outline-none">
                            <option value="AM" selected>AM</option>
                            <option value="PM">PM</option>
                        </select>
                    </div>
                </div>
            `;

            if (type === 'drop') {
                if(btnDrop) btnDrop.className = "flex-1 py-2.5 rounded-lg transition bg-white text-indigo-950 shadow-sm font-bold border border-slate-200";
                if(btnPickup) btnPickup.className = "flex-1 py-2.5 rounded-lg transition text-slate-600 font-semibold border border-transparent";
                formBox.innerHTML = `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="relative location-entry">
                            <label for="wd-airport-pickup" class="block text-xs font-bold text-slate-700 uppercase mb-1.5"><i class="fa-solid fa-location-dot text-indigo-600 mr-1"></i> From *</label>
                            <input type="text" id="wd-airport-pickup" autocomplete="off" oninput="scheduleGooglePlaceSearch('wd-airport-pickup', 'wd-airport-dropdown')" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none font-medium" placeholder="Search pickup on Google">
                            <div id="wd-airport-dropdown" class="autocomplete-dropdown hidden"></div>
                            <button type="button" onclick="useBookingPickupCurrentLocation('airport')" class="location-current-action mt-2 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100">
                                <i class="fa-solid fa-location-crosshairs"></i> Use My Current Location
                            </button>
                            <p id="wd-airport-location-status" class="text-[10px] text-slate-500 mt-1"></p>
                        </div>
                        <div>
                            <label for="wd-airport-terminal" class="block text-xs font-bold text-slate-700 uppercase mb-1.5"><i class="fa-solid fa-plane text-indigo-600 mr-1"></i> Airport / Terminal *</label>
                            <select id="wd-airport-terminal" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none font-medium" onchange="updateAirportRouteEstimate()">
                                <option value="t2" selected>Mumbai Airport T2 (International / Domestic)</option>
                                <option value="t1">Mumbai Airport T1 (Santacruz Domestic)</option>
                                <option value="nmia">Navi Mumbai International Airport (NMIA)</option>
                            </select>
                        </div>
                    </div>
                    ${dateTimeHTML}
                `;
            } else {
                if(btnPickup) btnPickup.className = "flex-1 py-2.5 rounded-lg transition bg-white text-indigo-950 shadow-sm font-bold border border-slate-200";
                if(btnDrop) btnDrop.className = "flex-1 py-2.5 rounded-lg transition text-slate-600 font-semibold border border-transparent";
                formBox.innerHTML = `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label for="wd-airport-terminal" class="block text-xs font-bold text-slate-700 uppercase mb-1.5"><i class="fa-solid fa-plane text-indigo-600 mr-1"></i> Airport / Terminal *</label>
                            <select id="wd-airport-terminal" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none font-medium" onchange="updateAirportRouteEstimate()">
                                <option value="t2" selected>Mumbai Airport T2 (International / Domestic)</option>
                                <option value="t1">Mumbai Airport T1 (Santacruz Domestic)</option>
                                <option value="nmia">Navi Mumbai International Airport (NMIA)</option>
                            </select>
                        </div>
                        <div class="relative">
                            <label for="wd-airport-pickup" class="block text-xs font-bold text-slate-700 uppercase mb-1.5"><i class="fa-solid fa-location-dot text-indigo-600 mr-1"></i> To *</label>
                            <input type="text" id="wd-airport-pickup" autocomplete="off" oninput="scheduleGooglePlaceSearch('wd-airport-pickup', 'wd-airport-dropdown')" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none font-medium" placeholder="Search drop on Google">
                            <div id="wd-airport-dropdown" class="autocomplete-dropdown hidden"></div>
                            <p id="wd-airport-location-status" class="text-[10px] text-slate-500 mt-1"></p>
                        </div>
                    </div>
                    ${dateTimeHTML}
                    <div>
                        <label for="wd-airport-flight-number" class="block text-xs font-bold text-slate-700 uppercase mb-1.5"><i class="fa-solid fa-ticket text-indigo-600 mr-1"></i> Flight Number (Optional)</label>
                        <input type="text" id="wd-airport-flight-number" maxlength="30" autocomplete="off" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none font-medium" placeholder="e.g. AI 639">
                    </div>
                `;
            }

          updateDatePlaceholder('wd-airport-date', 'wd-airport-date-placeholder');      
                
        }

function onPickupDateChange() {
    const pickupDate = document.getElementById('wd-out-pdate').value;
    const returnDate = document.getElementById('wd-out-rdate');
    if (pickupDate) {
        returnDate.min = pickupDate;
        if (returnDate.value && returnDate.value < pickupDate) {
            returnDate.value = pickupDate;
            returnDate.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    calculateDriverFare();
}

        async function selectQuickRoute(destName) {
            const card = [...document.querySelectorAll('#quick-plan-routes button')].find(button =>
                button.firstElementChild?.textContent.split('➔').pop().trim() === destName);
            const route = card?.firstElementChild?.textContent.split('➔').map(value => value.trim());
            if (currentMainMode !== 'withdriver') setServiceMode('withdriver');
            setWDSubTab('outstation');
            const pickupInput = document.getElementById('wd-out-pickup');
            const destInput = document.getElementById('wd-out-destination');
            const pickupText = route?.[0] || 'Mumbai';
            const destinationText = route?.[1] || destName;
            if (pickupInput) pickupInput.value = pickupText;
            if (destInput) destInput.value = destinationText;
            invalidateOutstationRoute('Finding the selected quick route on Google…');
            try {
                const [pickupResults, destinationResults] = await Promise.all([
                    publicMapsRequest('autocomplete', { input: pickupText }),
                    publicMapsRequest('autocomplete', { input: destinationText })
                ]);
                const pickup = pickupResults.suggestions?.[0];
                const destination = destinationResults.suggestions?.[0];
                if (!pickup || !destination) throw new Error('Please select the pickup and final drop from Google suggestions.');
                await validatePickupPlaceId(pickup.placeId);
                outstationPlaceSelections.set('wd-out-pickup', { placeId: pickup.placeId, name: pickup.mainText || pickup.text, address: pickup.text || pickup.mainText });
                outstationPlaceSelections.set('wd-out-destination', { placeId: destination.placeId, name: destination.mainText || destination.text, address: destination.text || destination.mainText });
                if (pickupInput) pickupInput.value = pickup.text || pickup.mainText;
                if (destInput) destInput.value = destination.text || destination.mainText;
                await updateOutstationRouteEstimate();
            } catch (error) {
                invalidateOutstationRoute(error.message || 'Please select the route from Google suggestions.');
            }
            document.getElementById('booking-widget').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function showSuggestions(inputId, datasetType, dropdownId) {
            const input = document.getElementById(inputId);
            const dropdown = document.getElementById(dropdownId);
            const query = input.value.trim().toLowerCase();
            if (!query) { dropdown.innerHTML = ''; dropdown.classList.add('hidden'); return; }

            let matches = [];
            if (datasetType === 'mumbai-places') {
                const source = inputId === 'wd-out-pickup' ? outstationPickupPlaces : inputId === 'wd-airport-pickup' ? airportAreaPlaces : localPickupPlaces;
                matches = source.filter(p => p.toLowerCase().includes(query));
            }
            else if (datasetType === 'maharashtra-destinations') matches = destinationCities.filter(c => c.name.toLowerCase().includes(query)).map(c => c.name);
            else if (datasetType === 'mumbai-metro-locations') matches = mumbaiMetroLocations.filter(l => l.active !== false && l.selfDriveDelivery === true && l.name.toLowerCase().includes(query)).map(l => l.name);

            if (matches.length === 0) { dropdown.innerHTML = ''; dropdown.classList.add('hidden'); return; }

            dropdown.innerHTML = '';
            matches.forEach(item => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.innerHTML = `<i class="fa-solid fa-location-dot text-slate-400 text-xs"></i><span>${item}</span>`;
                div.onmousedown = (e) => {
                    e.preventDefault();
                    input.value = item;
                    dropdown.classList.add('hidden');
                    input.classList.remove('border-red-500');
                    if (datasetType === 'maharashtra-destinations') onWDDestinationInput();
                    else if (datasetType === 'mumbai-metro-locations') {
                        updateSDFareReview();
                        onDeliveryLocationSelect();
                    }
                };
                dropdown.appendChild(div);
            });
            dropdown.classList.remove('hidden');
        }

        document.addEventListener('click', (e) => {
            document.querySelectorAll('.autocomplete-dropdown').forEach(dd => {
                if (!dd.contains(e.target) && !e.target.matches('input')) dd.classList.add('hidden');
            });
        });

        async function validatePickupPlaceId(placeId) {
            if (!placeId) throw new Error('Please select the pickup location from Google suggestions.');
            const result = await publicMapsRequest('validate-pickup', { placeId });
            if (!result.allowed) throw new Error(result.message || 'Pickup is available only in Mumbai, Thane, and Navi Mumbai.');
            return result;
        }

        function pickupStatusElement(inputId) {
            if (inputId === 'wd-local-pickup') return document.getElementById('wd-local-location-status');
            if (inputId === 'wd-out-pickup') return document.getElementById('wd-out-location-status');
            if (inputId === 'wd-airport-pickup' && currentAirportType === 'drop') return document.getElementById('wd-airport-location-status');
            return null;
        }

        async function publicMapsRequest(action, extra = {}) {
            const response = await fetch('/api/maps-route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...extra })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload?.success) throw new Error(payload?.message || 'Unable to calculate this route.');
            return payload;
        }

        async function updateAirportRouteEstimate() {
            if (currentWDSubTab !== 'airport') return null;
            const input = document.getElementById('wd-airport-pickup');
            const terminal = document.getElementById('wd-airport-terminal')?.value;
            const status = document.getElementById('wd-airport-location-status');
            const placeId = input?.dataset.googlePlaceId || '';
            airportRouteQuote = null;
            if (!input?.value.trim() || !placeId || !terminal) {
                if (status && currentAirportType === 'pickup') status.textContent = '';
                calculateDriverFare();
                return null;
            }
            if (status) {
                status.textContent = 'Checking Airport Transfer availability…';
                status.className = 'text-[10px] text-slate-500 mt-1';
            }
            try {
                const result = await publicMapsRequest('airport-route', {
                    terminal,
                    customerPlaceId: placeId,
                    airportType: currentAirportType
                });
                airportRouteQuote = result;
                if (Number(result.distanceMeters) > AIRPORT_MAX_METERS) {
                    if (status) {
                        status.textContent = 'This location is outside our Airport Transfer service area. Please use Outstation booking for this trip.';
                        status.className = 'text-[10px] text-rose-600 font-semibold mt-1';
                    }
                    input.classList.add('border-red-500');
                    return result;
                }
                input.classList.remove('border-red-500');
                if (status) {
                    status.textContent = '✓ Airport Transfer available for this location.';
                    status.className = 'text-[10px] text-emerald-700 font-semibold mt-1';
                }
                return result;
            } catch (error) {
                if (status) {
                    status.textContent = error.message || 'Unable to check Airport Transfer availability.';
                    status.className = 'text-[10px] text-rose-600 font-semibold mt-1';
                }
                input.classList.add('border-red-500');
                return null;
            } finally {
                calculateDriverFare();
            }
        }

        function invalidateOutstationRoute(message = '') {
            outstationRouteSequence += 1;
            wdOutstationRouteQuote = null;
            wdOutstationKm = 0;
            const km = document.getElementById('wd-metric-km');
            if (km) km.textContent = '—';
            const status = document.getElementById('wd-out-route-status');
            if (status) {
                status.textContent = message;
                status.classList.toggle('hidden', !message);
            }
            calculateDriverFare();
        }

        function scheduleGooglePlaceSearch(inputId, dropdownId) {
            const input = document.getElementById(inputId);
            const dropdown = document.getElementById(dropdownId);
            if (!input || !dropdown) return;
            if (inputId === 'wd-airport-pickup') {
                input.dataset.googlePlaceId = '';
                airportRouteQuote = null;
            }
            const existing = outstationSearchTimers.get('google:' + inputId);
            if (existing) clearTimeout(existing);
            const query = input.value.trim();
            if (query.length < 3) {
                dropdown.innerHTML = '';
                dropdown.classList.add('hidden');
                return;
            }
            const timer = setTimeout(async () => {
                try {
                    const payload = await publicMapsRequest('autocomplete', { input: query });
                    if (input.value.trim() !== query) return;
                    dropdown.innerHTML = '';
                    const suggestions = payload.suggestions || [];
                    if (!suggestions.length) {
                        dropdown.classList.add('hidden');
                        return;
                    }
                    suggestions.forEach(place => {
                        const option = document.createElement('button');
                        option.type = 'button';
                        option.className = 'autocomplete-item w-full text-left';
                        const icon = document.createElement('i');
                        icon.className = 'fa-solid fa-location-dot text-slate-400 text-xs';
                        const wrap = document.createElement('span');
                        const main = document.createElement('span');
                        main.className = 'block font-semibold';
                        main.textContent = place.mainText || place.text || '';
                        const secondary = document.createElement('span');
                        secondary.className = 'block text-[10px] text-slate-400 mt-0.5';
                        secondary.textContent = place.secondaryText || '';
                        wrap.append(main, secondary);
                        option.append(icon, wrap);
                        option.addEventListener('mousedown', async event => {
                            event.preventDefault();
                            input.value = place.text || place.mainText || '';
                            input.dataset.googlePlaceId = place.placeId || '';
                            input.dataset.pickupAllowed = '';
                            dropdown.classList.add('hidden');
                            input.classList.remove('border-red-500');
                            if (inputId === 'sd-delivery-location-input') {
                                onSelfDriveGooglePlaceSelected(place);
                                return;
                            }
                            const needsPickupCheck = inputId === 'wd-local-pickup' || (inputId === 'wd-airport-pickup' && currentAirportType === 'drop');
                            if (needsPickupCheck) {
                                const status = pickupStatusElement(inputId);
                                try {
                                    const check = await validatePickupPlaceId(place.placeId);
                                    input.dataset.pickupAllowed = 'true';
                                    if (status) {
                                        status.textContent = '✓ Pickup available in ' + check.serviceArea;
                                        status.className = 'text-[10px] text-emerald-700 font-semibold mt-1';
                                    }
                                } catch (error) {
                                    input.dataset.pickupAllowed = 'false';
                                    input.classList.add('border-red-500');
                                    if (status) {
                                        status.textContent = error.message;
                                        status.className = 'text-[10px] text-rose-600 font-semibold mt-1';
                                    }
                                }
                            }
                            if (inputId === 'wd-airport-pickup') {
                                await updateAirportRouteEstimate();
                            }
                        });
                        dropdown.appendChild(option);
                    });
                    dropdown.classList.remove('hidden');
                } catch (error) {
                    dropdown.innerHTML = '';
                    dropdown.classList.add('hidden');
                    showCustomAlert(error.message || 'Google location search failed.');
                }
            }, 350);
            outstationSearchTimers.set('google:' + inputId, timer);
        }

        function scheduleOutstationPlaceSearch(inputId, dropdownId) {
            const input = document.getElementById(inputId);
            const dropdown = document.getElementById(dropdownId);
            if (!input || !dropdown) return;
            outstationPlaceSelections.delete(inputId);
            invalidateOutstationRoute('');
            const existing = outstationSearchTimers.get(inputId);
            if (existing) clearTimeout(existing);
            const query = input.value.trim();
            if (query.length < 3) {
                dropdown.innerHTML = '';
                dropdown.classList.add('hidden');
                return;
            }
            const timer = setTimeout(async () => {
                try {
                    const payload = await publicMapsRequest('autocomplete', { input: query });
                    if (input.value.trim() !== query) return;
                    dropdown.innerHTML = '';
                    const suggestions = payload.suggestions || [];
                    if (!suggestions.length) {
                        dropdown.classList.add('hidden');
                        return;
                    }
                    suggestions.forEach(place => {
                        const option = document.createElement('button');
                        option.type = 'button';
                        option.className = 'autocomplete-item w-full text-left';
                        const icon = document.createElement('i');
                        icon.className = 'fa-solid fa-location-dot text-slate-400 text-xs';
                        const textWrap = document.createElement('span');
                        const main = document.createElement('span');
                        main.className = 'block font-semibold';
                        main.textContent = place.mainText || place.text || '';
                        const secondary = document.createElement('span');
                        secondary.className = 'block text-[10px] text-slate-400 mt-0.5';
                        secondary.textContent = place.secondaryText || '';
                        textWrap.append(main, secondary);
                        option.append(icon, textWrap);
                        option.addEventListener('mousedown', async event => {
                            event.preventDefault();
                            input.value = place.text || place.mainText || '';
                            dropdown.classList.add('hidden');
                            if (inputId === 'wd-out-pickup') {
                                const status = pickupStatusElement(inputId);
                                try {
                                    const check = await validatePickupPlaceId(place.placeId);
                                    input.dataset.pickupAllowed = 'true';
                                    if (status) {
                                        status.textContent = '✓ Pickup available in ' + check.serviceArea;
                                        status.className = 'text-[10px] text-emerald-700 font-semibold mt-1';
                                    }
                                } catch (error) {
                                    input.dataset.pickupAllowed = 'false';
                                    input.classList.add('border-red-500');
                                    outstationPlaceSelections.delete(inputId);
                                    invalidateOutstationRoute(error.message);
                                    if (status) {
                                        status.textContent = error.message;
                                        status.className = 'text-[10px] text-rose-600 font-semibold mt-1';
                                    }
                                    return;
                                }
                            }
                            outstationPlaceSelections.set(inputId, {
                                placeId: place.placeId,
                                name: place.mainText || place.text || '',
                                address: place.text || ''
                            });
                            input.classList.remove('border-red-500');
                            updateOutstationRouteEstimate();
                        });
                        dropdown.appendChild(option);
                    });
                    dropdown.classList.remove('hidden');
                } catch (error) {
                    dropdown.innerHTML = '';
                    dropdown.classList.add('hidden');
                    const status = document.getElementById('wd-out-route-status');
                    if (status) {
                        status.textContent = error.message || 'Google location search failed.';
                        status.classList.remove('hidden');
                    }
                }
            }, 350);
            outstationSearchTimers.set(inputId, timer);
        }

        function addOutstationStop() {
            const container = document.getElementById('wd-out-stops');
            if (!container) return;
            const existing = container.querySelectorAll('[data-outstation-stop-row]').length;
            if (existing >= 8) {
                showCustomAlert('You can add up to 8 intermediate stops.');
                return;
            }
            const seq = ++outstationStopSequence;
            const inputId = 'wd-out-stop-' + seq;
            const dropdownId = inputId + '-dropdown';
            const row = document.createElement('div');
            row.dataset.outstationStopRow = 'true';
            row.className = 'flex items-start gap-2';
            const relative = document.createElement('div');
            relative.className = 'relative flex-1';
            const input = document.createElement('input');
            input.type = 'text';
            input.id = inputId;
            input.autocomplete = 'off';
            input.dataset.outstationStopInput = 'true';
            input.className = 'w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-600 outline-none font-medium';
            input.placeholder = 'Search stop ' + (existing + 1) + ' on Google';
            input.addEventListener('input', () => scheduleOutstationPlaceSearch(inputId, dropdownId));
            const dropdown = document.createElement('div');
            dropdown.id = dropdownId;
            dropdown.className = 'autocomplete-dropdown hidden';
            relative.append(input, dropdown);
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'mt-1 h-9 w-9 shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100';
            add.setAttribute('aria-label', 'Add another stop');
            add.innerHTML = '<i class="fa-solid fa-plus"></i>';
            add.addEventListener('click', () => addOutstationStopAfter(row));

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'mt-1 h-9 w-9 shrink-0 rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100';
            remove.setAttribute('aria-label', 'Remove stop');
            remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            remove.addEventListener('click', () => {
                outstationPlaceSelections.delete(inputId);
                row.remove();
                invalidateOutstationRoute('');
                updateOutstationRouteEstimate();
            });
            row.append(relative, add, remove);
            container.appendChild(row);
            input.focus();
        }

        function addOutstationStopAfter(referenceRow) {
            const container = document.getElementById('wd-out-stops');
            if (!container) return;
            const before = [...container.children].indexOf(referenceRow);
            addOutstationStop();
            const rows = [...container.querySelectorAll('[data-outstation-stop-row]')];
            const created = rows[rows.length - 1];
            if (created && before >= 0) {
                container.insertBefore(created, referenceRow.nextSibling);
                created.querySelector('input')?.focus();
            }
        }

        function collectOutstationRouteSelections(strict = false) {
            const pickupInput = document.getElementById('wd-out-pickup');
            const finalInput = document.getElementById('wd-out-destination');
            const pickup = outstationPlaceSelections.get('wd-out-pickup');
            const finalDrop = outstationPlaceSelections.get('wd-out-destination');
            if (strict && (!pickupInput?.value.trim() || !pickup)) throw new Error('Please select the pickup location from Google suggestions.');
            if (strict && (!finalInput?.value.trim() || !finalDrop)) throw new Error('Please select the final drop from Google suggestions.');
            if (!pickup || !finalDrop) return null;

            const stops = [];
            for (const input of document.querySelectorAll('[data-outstation-stop-input="true"]')) {
                const typed = input.value.trim();
                if (!typed) continue;
                const selected = outstationPlaceSelections.get(input.id);
                if (strict && !selected) throw new Error('Please select every intermediate stop from Google suggestions.');
                if (!selected) return null;
                stops.push(selected);
            }
            return { pickup, stops, finalDrop };
        }

        async function updateOutstationRouteEstimate() {
            if (!currentOutstationJourneyType) {
                invalidateOutstationRoute('Choose one-way or round trip to calculate the fare.');
                return;
            }
            const selections = collectOutstationRouteSelections(false);
            if (!selections) return;
            const sequence = ++outstationRouteSequence;
            const status = document.getElementById('wd-out-route-status');
            if (status) {
                status.textContent = 'Calculating complete vehicle route from Vikhroli base…';
                status.classList.remove('hidden');
            }
            try {
                const payload = await publicMapsRequest('route', {
                    pickupPlaceId: selections.pickup.placeId,
                    stopPlaceIds: selections.stops.map(stop => stop.placeId),
                    finalDropPlaceId: selections.finalDrop.placeId,
                    journeyType: currentOutstationJourneyType
                });
                if (sequence !== outstationRouteSequence) return;
                wdOutstationRouteQuote = payload;
                if (payload.journeyType !== currentOutstationJourneyType) {
                    invalidateOutstationRoute('Route type changed. Please recalculate the fare.');
                    return;
                }
                wdOutstationKm = Number(payload.routeKmRoundedUp) || 0;
                const km = document.getElementById('wd-metric-km');
                if (km) km.textContent = Number(payload.distanceKmExact || wdOutstationKm).toLocaleString('en-IN');
                if (status) {
                    status.textContent = '';
                    status.classList.add('hidden');
                }
                calculateDriverFare();
            } catch (error) {
                if (sequence !== outstationRouteSequence) return;
                invalidateOutstationRoute(error.message || 'Unable to calculate route distance.');
            }
        }

        function onWDDestinationInput() {
            // Kept for older generated links. Google selection now drives route distance.
            invalidateOutstationRoute('');
        }

        function currentOutstationRouteSignature() {
            const route = collectOutstationRouteSelections(false);
            if (!route) return '';
            return [
                route.pickup.placeId,
                ...route.stops.map(stop => stop.placeId),
                route.finalDrop.placeId,
                currentOutstationJourneyType
            ].join('|');
        }

        function secondsLabel(seconds) {
            const total = Math.max(0, Math.round(Number(seconds) || 0));
            const hours = Math.floor(total / 3600);
            const minutes = Math.round((total % 3600) / 60);
            if (hours && minutes) return hours + ' hr ' + minutes + ' min';
            if (hours) return hours + ' hr';
            return minutes + ' min';
        }

        function to24Hour(hour, ampm) {
            let h = Number(hour) % 12;
            if (ampm === 'PM') h += 12;
            return h;
        }

        function qualifyingNightKey(dateValue, hourValue, ampmValue, minuteValue = 0) {
            if (!dateValue) return null;
            const hour = to24Hour(hourValue, ampmValue);
            const minute = Number(minuteValue) || 0;
            const totalMinutes = hour * 60 + minute;
            // Night charge applies from 11:00 PM through 4:00 AM.
            if (!(totalMinutes >= 23 * 60 || totalMinutes <= 4 * 60)) return null;
            const date = new Date(dateValue + 'T12:00:00');
            if (!Number.isFinite(date.getTime())) return null;
            if (totalMinutes <= 5 * 60) date.setDate(date.getDate() - 1);
            return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
        }

        function currentQualifyingNightCount() {
            const nights = new Set();
            if (currentWDSubTab === 'outstation') {
                const p = qualifyingNightKey(
                    document.getElementById('wd-out-pdate')?.value,
                    document.getElementById('wd-out-phour')?.value,
                    document.getElementById('wd-out-pampm')?.value
                );
                const r = qualifyingNightKey(
                    document.getElementById('wd-out-rdate')?.value,
                    document.getElementById('wd-out-rhour')?.value,
                    document.getElementById('wd-out-rampm')?.value
                );
                if (p) nights.add(p);
                if (r) nights.add(r);
            } else if (currentWDSubTab === 'local') {
                const dateValue = document.getElementById('wd-local-date')?.value;
                const hourValue = document.getElementById('wd-local-hour')?.value;
                const ampmValue = document.getElementById('wd-local-ampm')?.value;
                const p = qualifyingNightKey(dateValue, hourValue, ampmValue);
                if (p) nights.add(p);
                if (dateValue) {
                    const parts = dateValue.split('-').map(Number);
                    const startHour = to24Hour(hourValue, ampmValue);
                    const pkg = document.getElementById('wd-local-package')?.value;
                    const packageHours = pkg === '12hr_120km' ? 12 : pkg === '10hr_100km' ? 10 : 8;
                    const end = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], startHour) + packageHours * 3600000);
                    const endDate = end.getUTCFullYear() + '-' + String(end.getUTCMonth() + 1).padStart(2, '0') + '-' + String(end.getUTCDate()).padStart(2, '0');
                    const endHour24 = end.getUTCHours();
                    const endHour12 = endHour24 % 12 || 12;
                    const endAmpm = endHour24 >= 12 ? 'PM' : 'AM';
                    const endNight = qualifyingNightKey(endDate, endHour12, endAmpm);
                    if (endNight) nights.add(endNight);
                }
            } else if (currentWDSubTab === 'airport') {
                const p = qualifyingNightKey(
                    document.getElementById('wd-airport-date')?.value,
                    document.getElementById('wd-airport-hour')?.value,
                    document.getElementById('wd-airport-ampm')?.value
                );
                if (p) nights.add(p);
            }
            return nights.size;
        }

        function nightRateForCar(car) {
            return /hatchback|sedan/i.test(String(car?.category || '')) ? 400 : 600;
        }

        function currentDriverNightCharge(car) {
            return currentQualifyingNightCount() * nightRateForCar(car);
        }

        function calculateDriverFare() {
            if (currentMainMode === 'withdriver' && currentWDSubTab === 'outstation') {
                const pDate = document.getElementById('wd-out-pdate')?.value;
                const rDate = document.getElementById('wd-out-rdate')?.value;
                if (pDate && rDate) {
                    const pDay = new Date(pDate + 'T12:00:00');
                    const rDay = new Date(rDate + 'T12:00:00');
                    const diffDays = Math.max(1, Math.round((rDay - pDay) / 86400000) + 1);
                    wdOutstationDays = diffDays;
                } else {
                    wdOutstationDays = 1;
                }
                const minimumKm = wdOutstationDays * livePricingRules.minimumOutstationKmPerDay;
                const includedKm = Math.max(wdOutstationKm || 0, minimumKm);
                const daysEl = document.getElementById('wd-metric-days');
                const includedEl = document.getElementById('wd-metric-included-km');
                const minimumEl = document.getElementById('wd-metric-minimum');
                if (daysEl) daysEl.textContent = wdOutstationDays;
                if (includedEl) includedEl.textContent = currentOutstationJourneyType && wdOutstationRouteQuote
                    ? includedKm.toLocaleString('en-IN')
                    : '—';
                if (minimumEl) minimumEl.textContent = currentOutstationJourneyType
                    ? 'Minimum included distance: ' + wdOutstationDays + ' × ' + livePricingRules.minimumOutstationKmPerDay + ' km per day (' + minimumKm.toLocaleString('en-IN') + ' km minimum).'
                    : 'Choose one-way or round trip and add your route to see the included distance.';
                const nightBadge = document.getElementById('wd-metric-night-badge');
                if (nightBadge) nightBadge.classList.toggle('hidden', currentQualifyingNightCount() === 0);
            }
            renderWDFleet();
        }

        function getCarCost(car) {
            const nightCharge = currentDriverNightCharge(car);
            if (currentWDSubTab === 'local') {
                const pkg = document.getElementById('wd-local-package').value;
                return (car.rates.local[pkg] || 3000) + nightCharge;
            } else if (currentWDSubTab === 'outstation') {
                if (!currentOutstationJourneyType) return null;
                const includedKm = Math.max(wdOutstationKm || 0, wdOutstationDays * livePricingRules.minimumOutstationKmPerDay);
                return (includedKm * car.rates.outstationPerKm) + (wdOutstationDays * OUTSTATION_DRIVER_ALLOWANCE_PER_DAY) + nightCharge;
            } else if (currentWDSubTab === 'airport') {
                const termInput = document.getElementById('wd-airport-terminal');
                const term = termInput ? termInput.value : 't2';
                return (car.rates.airport[term] || car.rates.airport.t2) + nightCharge;
            }
            return 3000;
        }

        function renderWDFleet() {
            const container = document.getElementById('fleet-container');
            if (!container) return;
            container.innerHTML = '';

            wdFleet.forEach(car => {
                const fare = getCarCost(car);
                const card = document.createElement('div');
                card.className = "bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl transition p-5 flex flex-col justify-between";

                let kmIncludedText = "80 KM included";
                let hrsIncludedText = "8 Hours included";
                if (currentWDSubTab === 'local') {
                    const pkg = document.getElementById('wd-local-package').value;
                    if (pkg === '12hr_120km') {
                        kmIncludedText = "120 KM included";
                        hrsIncludedText = "12 Hours included";
                    } else if (pkg === '10hr_100km') {
                        kmIncludedText = "100 KM included";
                        hrsIncludedText = "10 Hours included";
                    }
                } else if (currentWDSubTab === 'outstation') {
                    const includedKm = Math.max(wdOutstationKm, wdOutstationDays * livePricingRules.minimumOutstationKmPerDay);
                    kmIncludedText = currentOutstationJourneyType && wdOutstationRouteQuote
                        ? `${includedKm.toLocaleString('en-IN')} km included`
                        : currentOutstationJourneyType ? 'Enter route to see included km' : 'Choose a trip type to see included km';
                    hrsIncludedText = currentOutstationJourneyType
                        ? `${wdOutstationDays * 24} hours (${wdOutstationDays} day${wdOutstationDays === 1 ? '' : 's'})`
                        : 'Trip duration';
                } else if (currentWDSubTab === 'airport') {
                    kmIncludedText = "Airport Transfer Drop/Pickup";
                    hrsIncludedText = "On-time Guaranteed";
                }

                card.innerHTML = `
                    <div>
                        <div class="flex items-start justify-between mb-3">
                            <div>
                                <span class="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">${car.category}</span>
                                <h3 class="font-bold text-slate-900 text-base mt-1.5">${car.name}</h3>
                            </div>
                            <div class="text-right">
                                <span class="text-[10px] text-slate-400 block font-semibold">Estimated Fare</span>
                                <span class="text-xl font-black text-indigo-950">${fare === null ? 'Choose trip type' : '₹' + fare.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                        <div class="flex items-center space-x-3 text-xs text-slate-500 my-2 py-2 border-y border-slate-100">
                            <span><i class="fa-solid fa-users text-slate-400 mr-1"></i> ${car.seats}</span>
                            <span><i class="fa-solid fa-suitcase text-slate-400 mr-1"></i> ${car.bags}</span>
                        </div>
                        <div class="bg-indigo-50/60 border border-indigo-100 text-indigo-950 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg mb-4 flex items-center justify-between">
                            <span><i class="fa-solid fa-road text-indigo-600 mr-1"></i> ${kmIncludedText}</span>
                            <span><i class="fa-solid fa-clock text-indigo-600 mr-1"></i> ${hrsIncludedText}</span>
                        </div>
                        <div class="text-[11px] leading-relaxed mb-4 space-y-1">
                            <p class="text-emerald-800"><i class="fa-solid fa-check mr-1"></i> Includes car, fuel &amp; driver</p>
                            <p class="text-rose-800"><i class="fa-solid fa-circle-info mr-1"></i> Extra as actuals: tolls, parking${currentWDSubTab === 'outstation' ? ' &amp; state tax' : ''}</p>
                        </div>
                    </div>
                    <button type="button" ${fare === null ? 'disabled' : ''} onclick="handleBookThisCarClick('${car.name}', ${fare === null ? 0 : fare})" class="w-full ${fare === null ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-950 hover:bg-indigo-900'} text-white font-bold py-2.5 rounded-xl transition text-xs tracking-wide shadow-sm">
                        ${fare === null ? 'Choose Trip Type' : 'Book This Car'}
                    </button>
                `;
                container.appendChild(card);
            });
        }

        function validateJourneyDateTimes(pickupIds, returnIds) {
            const readDateTime = ids => {
                const [date, hour, ampm] = ids.map(id => document.getElementById(id)?.value);
                const numericHour = Number(hour);
                if (!date || !Number.isInteger(numericHour) || numericHour < 1 || numericHour > 12 || !['AM', 'PM'].includes(ampm)) return new Date(NaN);
                return createLocalDateTime(date, numericHour, ampm);
            };
            const pickup = readDateTime(pickupIds);
            let invalidIds = pickupIds;
            let message = '';
            if (!Number.isFinite(pickup.getTime())) {
                message = 'Please select a valid pickup date and time.';
            } else if (pickup.getTime() <= Date.now()) {
                message = 'Pickup date and time must be later than the current date and time.';
            } else if (returnIds) {
                const end = readDateTime(returnIds);
                invalidIds = returnIds;
                if (!Number.isFinite(end.getTime())) message = 'Please select a valid return date and time.';
                else if (end <= pickup) message = 'Return date and time must be later than pickup date and time.';
            }
            if (!message) return true;
            showCustomAlert(message);
            const field = document.getElementById(invalidIds[0]);
            field?.classList.add('border-red-500');
            field?.focus();
            return false;
        }

        function validateJourneyAndOpenBooking(carName, fare) {
            let missing = false;
            let firstMissingField = null;

            if (currentWDSubTab === 'local') {
                const localPickupInput = document.getElementById('wd-local-pickup');
                const localDateInput = document.getElementById('wd-local-date');
                if (!localPickupInput || !localPickupInput.value.trim()) { 
                    if(localPickupInput) localPickupInput.classList.add('border-red-500'); 
                    firstMissingField = localPickupInput; 
                    missing = true; 
                } else if (!localPickupInput.dataset.googlePlaceId || localPickupInput.dataset.pickupAllowed !== 'true') {
                    localPickupInput.classList.add('border-red-500');
                    showCustomAlert('Please select a pickup in Mumbai, Thane, or Navi Mumbai from Google suggestions.');
                    return false;
                } else {
                    localPickupInput.classList.remove('border-red-500');
                }
                if (!localDateInput || !localDateInput.value) { 
                    if(localDateInput) localDateInput.classList.add('border-red-500'); 
                    if (!firstMissingField) firstMissingField = localDateInput; 
                    missing = true; 
                } else {
                    localDateInput.classList.remove('border-red-500');
                }
            } else if (currentWDSubTab === 'outstation') {
                const outPickupInput = document.getElementById('wd-out-pickup');
                const outDestInput = document.getElementById('wd-out-destination');
                const outPDateInput = document.getElementById('wd-out-pdate');
                const outRDateInput = document.getElementById('wd-out-rdate');

                if (!['one-way', 'round-trip'].includes(currentOutstationJourneyType)) {
                    showCustomAlert('Please choose one-way or round trip.');
                    document.getElementById('wd-out-one-way')?.focus();
                    return false;
                }
                
                if (!outPickupInput || !outPickupInput.value.trim()) { 
                    if(outPickupInput) outPickupInput.classList.add('border-red-500'); 
                    firstMissingField = outPickupInput; 
                    missing = true; 
                } else { outPickupInput.classList.remove('border-red-500'); }

                if (!outDestInput || !outDestInput.value.trim()) { 
                    if(outDestInput) outDestInput.classList.add('border-red-500'); 
                    if (!firstMissingField) firstMissingField = outDestInput; 
                    missing = true; 
                } else { outDestInput.classList.remove('border-red-500'); }

                if (!outPDateInput || !outPDateInput.value) { 
                    if(outPDateInput) outPDateInput.classList.add('border-red-500'); 
                    if (!firstMissingField) firstMissingField = outPDateInput; 
                    missing = true; 
                } else { outPDateInput.classList.remove('border-red-500'); }

                if (!outRDateInput || !outRDateInput.value) { 
                    if(outRDateInput) outRDateInput.classList.add('border-red-500'); 
                    if (!firstMissingField) firstMissingField = outRDateInput; 
                    missing = true; 
                } else { outRDateInput.classList.remove('border-red-500'); }

                if (!missing) {
                    try {
                        collectOutstationRouteSelections(true);
                    } catch (error) {
                        showCustomAlert(error.message);
                        return false;
                    }
                    if (!wdOutstationRouteQuote || !wdOutstationKm) {
                        const routeStatus = document.getElementById('wd-out-route-status')?.textContent?.trim();
                        showCustomAlert(routeStatus && !/^Calculating/i.test(routeStatus)
                            ? routeStatus
                            : 'Please wait for the Google route distance to finish calculating.');
                        return false;
                    }
                }

            } else if (currentWDSubTab === 'airport') {
                const airportPickupInput = document.getElementById('wd-airport-pickup');
                const airportDateInput = document.getElementById('wd-airport-date');

                if (!airportPickupInput || !airportPickupInput.value.trim()) { 
                    if(airportPickupInput) airportPickupInput.classList.add('border-red-500'); 
                    firstMissingField = airportPickupInput; 
                    missing = true; 
                } else if (!airportPickupInput.dataset.googlePlaceId) {
                    airportPickupInput.classList.add('border-red-500');
                    showCustomAlert('Please select the location from Google suggestions.');
                    return false;
                } else if (currentAirportType === 'drop' && airportPickupInput.dataset.pickupAllowed !== 'true') {
                    airportPickupInput.classList.add('border-red-500');
                    showCustomAlert('Please select a pickup in Mumbai, Thane, or Navi Mumbai from Google suggestions.');
                    return false;
                } else if (!airportRouteQuote) {
                    showCustomAlert('Please wait while we check Airport Transfer availability.');
                    return false;
                } else if (Number(airportRouteQuote.distanceMeters) > AIRPORT_MAX_METERS) {
                    airportPickupInput.classList.add('border-red-500');
                    showCustomAlert('This location is outside our Airport Transfer service area. Please use Outstation booking for this trip.');
                    return false;
                } else {
                    airportPickupInput.classList.remove('border-red-500');
                }

                if (!airportDateInput || !airportDateInput.value) { 
                    if(airportDateInput) airportDateInput.classList.add('border-red-500'); 
                    if (!firstMissingField) firstMissingField = airportDateInput; 
                    missing = true; 
                } else {
                    airportDateInput.classList.remove('border-red-500');
                }
            }

            if (missing) {
                showCustomAlert("Please add your pickup location and date to continue.");
                document.getElementById('with-driver-block').scrollIntoView({ behavior: 'smooth', block: 'start' });
                if (firstMissingField) firstMissingField.focus();
                return false;
            }
            if (currentWDSubTab === 'local') return validateJourneyDateTimes(['wd-local-date', 'wd-local-hour', 'wd-local-ampm']);
            if (currentWDSubTab === 'airport') return validateJourneyDateTimes(['wd-airport-date', 'wd-airport-hour', 'wd-airport-ampm']);
            return validateJourneyDateTimes(['wd-out-pdate', 'wd-out-phour', 'wd-out-pampm'], ['wd-out-rdate', 'wd-out-rhour', 'wd-out-rampm']);
        }

        function handleBookThisCarClick(carName, fare) {
            if (!validateJourneyAndOpenBooking(carName, fare)) return;
            openModal(carName, fare);
        }

        async function showCabSearchTransition(updateResults, targetId) {
            const overlay = document.getElementById('explore-cabs-overlay');
            if (overlay?.classList.contains('visible')) return;
            overlay?.classList.add('visible');
            overlay?.setAttribute('aria-hidden', 'false');
            try {
                updateResults();
                if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    await new Promise(resolve => setTimeout(resolve, 900));
                }
                document.getElementById(targetId).scrollIntoView({ behavior: 'auto' });
            } finally {
                overlay?.classList.remove('visible');
                overlay?.setAttribute('aria-hidden', 'true');
            }
        }

        async function triggerFareSearch() {
            if (currentMainMode === 'withdriver' && currentWDSubTab === 'outstation' && !wdOutstationRouteQuote) {
                await updateOutstationRouteEstimate();
            }
            if (currentMainMode === 'withdriver' && currentWDSubTab === 'airport' && !airportRouteQuote) {
                await updateAirportRouteEstimate();
            }
            if (currentMainMode === 'withdriver' && !validateJourneyAndOpenBooking()) return;
            await showCabSearchTransition(calculateDriverFare, 'fleet');
        }

        function validateSelfDriveJourney() {
            const pDate = document.getElementById('sd-pdate').value;
            const rDate = document.getElementById('sd-rdate').value;
            let missing = false;
            let firstMissingField = null;

            const pDateInput = document.getElementById('sd-pdate');
            const rDateInput = document.getElementById('sd-rdate');

            if (!pDate) { pDateInput.classList.add('border-red-500'); firstMissingField = pDateInput; missing = true; }
            else pDateInput.classList.remove('border-red-500');

            if (!rDate) { rDateInput.classList.add('border-red-500'); if (!firstMissingField) firstMissingField = rDateInput; missing = true; }
            else rDateInput.classList.remove('border-red-500');

            if (missing) {
                showCustomAlert("Please select your pickup and return dates to continue.");
                document.getElementById('self-drive-block').scrollIntoView({ behavior: 'smooth', block: 'start' });
                if (firstMissingField) firstMissingField.focus();
                return false;
            }
            return validateJourneyDateTimes(['sd-pdate', 'sd-phour', 'sd-pampm'], ['sd-rdate', 'sd-rhour', 'sd-rampm']);
        }

        async function triggerSDParseSearch() {
            if (!validateSelfDriveJourney()) return;
            await showCabSearchTransition(applyAllSDFilters, 'selfdrive-cars-grid');
        }

        function toggleSDFiltersPanel() {
            const panel = document.getElementById('sd-filters-expandable-panel');
            const btnText = document.getElementById('filter-toggle-text');
            if (panel.classList.contains('hidden')) {
                panel.classList.remove('hidden');
                btnText.innerText = "Hide Filters";
            } else {
                panel.classList.add('hidden');
                btnText.innerText = "Sort & Filter";
            }
        }

        function applyAllSDFilters() {
            const query = document.getElementById('sd-search-box').value.toLowerCase().trim();
            const brandVal = document.getElementById('sd-filter-brand').value;
            const fuelVal = document.getElementById('sd-filter-fuel').value;
            const transVal = document.getElementById('sd-filter-transmission').value;
            const seatsVal = document.getElementById('sd-filter-seats').value;
            const segVal = document.getElementById('sd-filter-segment').value;
            const sortVal = document.getElementById('sd-sort-by').value;

            let list = [...excelCarsData];
            if (query) list = list.filter(c => c.fullName.toLowerCase().includes(query) || c.brand.toLowerCase().includes(query));
            if (brandVal !== 'All') list = list.filter(c => c.brand.toLowerCase() === brandVal.toLowerCase());
            if (fuelVal !== 'All') list = list.filter(c => c.fuel.toLowerCase().includes(fuelVal.toLowerCase()));
            if (transVal !== 'All') list = list.filter(c => c.transmission.toLowerCase() === transVal.toLowerCase());
            if (seatsVal !== 'All') list = list.filter(c => c.seats === parseInt(seatsVal));
            if (segVal !== 'All') list = list.filter(c => c.segment.toLowerCase() === segVal.toLowerCase());

            if (sortVal === 'best-selling') list.sort((a, b) => (b.bestSelling === true ? 1 : 0) - (a.bestSelling === true ? 1 : 0));
            else if (sortVal === 'price-asc') list.sort((a, b) => a.rateVal - b.rateVal);
            else if (sortVal === 'price-desc') list.sort((a, b) => b.rateVal - a.rateVal);
            else list.sort((a, b) => a.priority - b.priority);

            filteredSDCarsList = list;
            currentSDPage = 1;
            renderSDPage();
        }

        function setBrandPill(brand) {
            document.getElementById('sd-filter-brand').value = brand;
            applyAllSDFilters();
        }

        function resetSDFilters() {
            document.getElementById('sd-search-box').value = '';
            document.getElementById('sd-filter-brand').value = 'All';
            document.getElementById('sd-filter-fuel').value = 'All';
            document.getElementById('sd-filter-transmission').value = 'All';
            document.getElementById('sd-filter-seats').value = 'All';
            document.getElementById('sd-filter-segment').value = 'All';
            document.getElementById('sd-sort-by').value = 'default';
            applyAllSDFilters();
        }

        function renderSDPage() {
            const container = document.getElementById('selfdrive-cars-grid');
            const infoSpan = document.getElementById('sd-pagination-info');
            const btnsContainer = document.getElementById('sd-pagination-btns');
            if (!container) return;

            container.innerHTML = '';
            btnsContainer.innerHTML = '';

            const totalCars = filteredSDCarsList.length;
            if (totalCars === 0) {
                container.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 font-medium">No cars found matching your filter criteria.</div>`;
                infoSpan.innerText = "Showing 0 of 0 cars";
                return;
            }

            const totalPages = Math.ceil(totalCars / carsPerPage);
            if (currentSDPage > totalPages) currentSDPage = totalPages;

            const startIndex = (currentSDPage - 1) * carsPerPage;
            const endIndex = Math.min(startIndex + carsPerPage, totalCars);
            const pageCars = filteredSDCarsList.slice(startIndex, endIndex);

            pageCars.forEach(car => {
                const card = document.createElement('div');
                card.className = "bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl transition overflow-hidden flex flex-col justify-between";
                card.innerHTML = `
                    <div>
                        <div class="h-44 w-full bg-slate-100 overflow-hidden relative">
                            <img src="${escapeFleetHTML(car.imgUrl)}" alt="${escapeFleetHTML(car.fullName)}" class="w-full h-full object-cover">
                            <span class="absolute top-3 left-3 text-[10px] font-bold bg-indigo-950/80 text-amber-300 px-2 py-0.5 rounded">${escapeFleetHTML(car.brand)}</span>
                        </div>
                        <div class="p-4">
                            <h3 class="font-bold text-slate-900 text-base">${escapeFleetHTML(car.fullName)}</h3>
                            <span class="text-lg font-black text-indigo-950 mt-1 block">${escapeFleetHTML(car.rateHour)}</span>
                        </div>
                    </div>
                    <div class="p-4 pt-0">
                        <button type="button" data-book-self-drive class="w-full bg-indigo-950 hover:bg-indigo-900 text-white font-bold py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-2">
                            <i class="fa-solid fa-key text-amber-400"></i> Book Self Drive
                        </button>
                    </div>
                `;
                card.querySelector('[data-book-self-drive]').onclick = () => handleBookSelfDriveClick(car);
                container.appendChild(card);
            });

            infoSpan.innerText = `Showing ${startIndex + 1} to ${endIndex} of ${totalCars} cars`;

            if (totalPages > 1) {
                const prevBtn = document.createElement('button');
                prevBtn.innerHTML = `Prev`;
                prevBtn.className = `px-3 py-1.5 rounded-lg text-xs font-bold border transition ${currentSDPage === 1 ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`;
                prevBtn.disabled = (currentSDPage === 1);
                prevBtn.onclick = () => { changeSDPage(currentSDPage - 1); };
                btnsContainer.appendChild(prevBtn);

                for (let i = 1; i <= totalPages; i++) {
                    const pageBtn = document.createElement('button');
                    pageBtn.innerText = i;
                    pageBtn.className = `w-8 h-8 rounded-lg text-xs font-bold transition ${i === currentSDPage ? 'bg-indigo-950 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`;
                    pageBtn.onclick = () => { changeSDPage(i); };
                    btnsContainer.appendChild(pageBtn);
                }

                const nextBtn = document.createElement('button');
                nextBtn.innerHTML = `Next`;
                nextBtn.className = `px-3 py-1.5 rounded-lg text-xs font-bold border transition ${currentSDPage === totalPages ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`;
                nextBtn.disabled = (currentSDPage === totalPages);
                nextBtn.onclick = () => { changeSDPage(currentSDPage + 1); };
                btnsContainer.appendChild(nextBtn);
            }
        }

        function changeSDPage(page) {
            currentSDPage = page;
            renderSDPage();
            document.getElementById('selfdrive-cars-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function handleBookSelfDriveClick(car) {
            if (!validateSelfDriveJourney()) return;
            openSDModal(car);
        }

        function syncModalState(modal, active) {
            modal.classList.toggle('active', active);
            document.body.classList.toggle('overflow-hidden',
                !!document.querySelector('[id$="-modal"].active') ||
                document.getElementById('nav-drawer')?.getAttribute('aria-hidden') === 'false');
        }

        function openFareBreakdownModal() {
            const contentBox = document.getElementById('fare-breakdown-content');
            if (!contentBox) return;
            const outstationExtra = currentWDSubTab === 'outstation'
                ? `<li><strong>Included distance:</strong> The fare includes the route distance or ${livePricingRules.minimumOutstationKmPerDay} km per booked day, whichever is higher.</li>
                   <li><strong>Driver allowance:</strong> ₹${OUTSTATION_DRIVER_ALLOWANCE_PER_DAY} per booked day.</li>
                   <li><strong>Night service:</strong> Charged only if the pickup or final drop falls between 11 PM and 4 AM — ₹400 for Hatchback/Sedan or ₹600 for SUV/MUV per qualifying night.</li>`
                : '';
            const extraCharges = currentWDSubTab === 'outstation'
                ? '<li><strong>Extra charges:</strong> Tolls, parking and applicable state taxes are charged at actual cost.</li>'
                : '<li><strong>Extra charges:</strong> Tolls and parking are charged at actual cost.</li>';
            contentBox.innerHTML = `
                <p class="font-bold text-slate-900">Transparent Fare & Inclusions Details:</p>
                <ul class="list-disc pl-4 space-y-1.5 pt-1">
                    <li><strong>Fuel & Driver:</strong> Included in the displayed fare.</li>
                    ${outstationExtra}
                    ${extraCharges}
                </ul>
            `;
            document.getElementById('fare-breakdown-modal').classList.remove('hidden'); syncModalState(document.getElementById('fare-breakdown-modal'), true);
        }
        function closeFareBreakdownModal() { document.getElementById('fare-breakdown-modal').classList.add('hidden'); syncModalState(document.getElementById('fare-breakdown-modal'), false); }

        async function useBookingPickupCurrentLocation(mode) {
            const config = mode === 'local'
                ? { inputId: 'wd-local-pickup', statusId: 'wd-local-location-status' }
                : mode === 'outstation'
                    ? { inputId: 'wd-out-pickup', statusId: 'wd-out-location-status' }
                    : { inputId: 'wd-airport-pickup', statusId: 'wd-airport-location-status' };
            const input = document.getElementById(config.inputId);
            const status = document.getElementById(config.statusId);
            if (!input) return;
            if (status) {
                status.textContent = 'Waiting for location permission…';
                status.className = 'text-[10px] text-slate-500 mt-1';
            }
            try {
                const position = await requestBrowserLocation();
                const result = await reverseGeocodeCurrentPosition(position);
                input.value = result.address || (result.latitude + ', ' + result.longitude);
                input.dataset.googlePlaceId = result.placeId || '';
                const check = await validatePickupPlaceId(result.placeId);
                input.dataset.pickupAllowed = 'true';
                if (mode === 'outstation') {
                    outstationPlaceSelections.set('wd-out-pickup', {
                        placeId: result.placeId,
                        name: result.address || 'Current Location',
                        address: result.address || ''
                    });
                    invalidateOutstationRoute('');
                    await updateOutstationRouteEstimate();
                } else if (mode === 'airport') {
                    await updateAirportRouteEstimate();
                }
                if (status && mode !== 'airport') {
                    status.textContent = '✓ Current location selected · Pickup available in ' + check.serviceArea;
                    status.className = 'text-[10px] text-emerald-700 font-semibold mt-1';
                }
            } catch (error) {
                if (status) {
                    status.textContent = geolocationErrorMessage(error);
                    status.className = 'text-[10px] text-rose-600 mt-1';
                }
            }
        }

        function geolocationErrorMessage(error) {
            if (error?.code === 1) return 'Location is blocked for this site. Allow Location from your browser site settings, then try again. You can also enter the address manually.';
            if (error?.code === 2) return 'Your current location could not be detected. Please try again or enter the address manually.';
            if (error?.code === 3) return 'Location request timed out. Please try again.';
            if (error?.message) return error.message;
            return 'Unable to get your current location. Please enter the address manually.';
        }

        async function reverseGeocodeCurrentPosition(position) {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            return publicMapsRequest('reverse-geocode', { latitude, longitude });
        }

        function requestBrowserLocation() {
            return new Promise((resolve, reject) => {
                if (!navigator.geolocation) return reject(new Error('Location is not supported on this device.'));
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 12000,
                    maximumAge: 30000
                });
            });
        }

        async function useCurrentLocation(target) {
            const buttonId = target === 'selfdrive' ? 'sd-use-current-location' : 'wd-use-current-location';
            const statusId = target === 'selfdrive' ? 'sd-current-location-status' : 'wd-current-location-status';
            const button = document.getElementById(buttonId);
            const status = document.getElementById(statusId);
            const original = button?.innerHTML;
            if (button) {
                button.disabled = true;
                button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Detecting…';
            }
            if (status) {
                status.textContent = 'Waiting for location permission…';
                status.className = 'text-[10px] text-slate-500 mt-1';
            }
            try {
                const position = await requestBrowserLocation();
                const result = await reverseGeocodeCurrentPosition(position);
                if (target === 'selfdrive') {
                    selfDriveCurrentLocation = result;
                    const address = document.getElementById('sd-cust-address');
                    const city = document.getElementById('sd-cust-city');
                    const state = document.getElementById('sd-cust-state');
                    const pin = document.getElementById('sd-cust-pincode');
                    if (address && result.address) address.value = result.address;
                    if (city && result.city) city.value = result.city;
                    if (state && result.state) state.value = result.state;
                    if (pin && result.postalCode) pin.value = result.postalCode;
                    const deliveryInput = document.getElementById('sd-delivery-location-input');
                    if (deliveryInput && result.placeId) {
                        const route = await publicMapsRequest('delivery-route', { placeId: result.placeId });
                        const oneWayKm = Number(route.oneWayDistanceKm);
                        if (!Number.isFinite(oneWayKm) || oneWayKm > 50) throw new Error('Your current location is outside our Self Drive home-delivery service area.');
                        deliveryInput.value = result.address || '';
                        deliveryInput.dataset.googlePlaceId = result.placeId;
                        selfDriveDeliverySelection = {
                            placeId: result.placeId,
                            address: result.address || '',
                            city: result.city || '',
                            state: result.state || '',
                            postalCode: result.postalCode || '',
                            oneWayKm
                        };
                        updateSDFareReview();
                    }
                } else {
                    withDriverCurrentLocation = result;
                    const address = document.getElementById('cust-address');
                    if (address && result.address) address.value = result.address;
                }
                if (status) {
                    status.textContent = '✓ Current location captured. You can edit the address or add a landmark.';
                    status.className = 'text-[10px] text-emerald-700 font-semibold mt-1';
                }
            } catch (error) {
                if (status) {
                    status.textContent = geolocationErrorMessage(error);
                    status.className = 'text-[10px] text-rose-600 mt-1';
                }
            } finally {
                if (button) {
                    button.disabled = false;
                    button.innerHTML = original;
                }
            }
        }

        function openModal(name, fare) {
            chosenCarName = name;
            withDriverCurrentLocation = null;
            const locationButtonWrap = document.getElementById('wd-current-location-wrap');
            if (locationButtonWrap) {
                const applicable = currentWDSubTab === 'local' || currentWDSubTab === 'outstation' || (currentWDSubTab === 'airport' && currentAirportType === 'drop');
                locationButtonWrap.classList.toggle('hidden', !applicable);
            }
            const locationStatus = document.getElementById('wd-current-location-status');
            if (locationStatus) locationStatus.textContent = '';
            firstTripFareBeforeDiscount = Number(fare) || 0;
            firstTripOfferApplied = false;
            chosenFareAmount = firstTripFareBeforeDiscount;
            document.getElementById('modal-car-name').innerText = name;
            renderFirstTripOffer();
            
            let pickupLoc = '';
            let destLoc = '';
            let dateTimeStr = '';
            let pkgStr = '';

            if (currentWDSubTab === 'local') {
                pickupLoc = document.getElementById('wd-local-pickup').value || 'Mumbai';
                destLoc = 'Local City Package';
                dateTimeStr = (document.getElementById('wd-local-date').value || 'Today') + ' @ ' + document.getElementById('wd-local-hour').value + ':00 ' + document.getElementById('wd-local-ampm').value;
                pkgStr = document.getElementById('wd-local-package').value.replace('8hr_80km', '8 Hours / 80 Km');
            } else if (currentWDSubTab === 'outstation') {
                const route = collectOutstationRouteSelections(false);
                pickupLoc = route?.pickup?.name || document.getElementById('wd-out-pickup').value || 'Pickup';
                const stopSummary = route?.stops?.length ? ' via ' + route.stops.map(stop => stop.name).join(' → ') : '';
                destLoc = (route?.finalDrop?.name || document.getElementById('wd-out-destination').value || 'Final Drop') + stopSummary;
                const formatReviewTime = prefix => {
                    const hour = document.getElementById(prefix + 'hour').value;
                    const ampm = document.getElementById(prefix + 'ampm').value;
                    const date = createLocalDateTime(document.getElementById(prefix + 'date').value, Number(hour), ampm);
                    return `${date.getDate()} ${date.toLocaleString('en-US', { month: 'short' })} ${date.getFullYear()}, ${Number(hour)}:00 ${ampm}`;
                };
                dateTimeStr = `Pickup: ${formatReviewTime('wd-out-p')}\nFinal Drop: ${formatReviewTime('wd-out-r')}`;
                const includedKm = Math.max(wdOutstationKm || 0, wdOutstationDays * livePricingRules.minimumOutstationKmPerDay);
                pkgStr = `${currentOutstationJourneyType === 'one-way' ? 'One-way' : 'Round trip'} · ${includedKm.toLocaleString('en-IN')} km included · ${wdOutstationDays} day(s)`;
            } else if (currentWDSubTab === 'airport') {
                pickupLoc = document.getElementById('wd-airport-pickup').value || 'Mumbai Address';
                destLoc = document.getElementById('wd-airport-terminal').value.toUpperCase() + ' Airport';
                dateTimeStr = (document.getElementById('wd-airport-date').value || 'Today') + ' @ ' + document.getElementById('wd-airport-hour').value + ':00 ' + document.getElementById('wd-airport-ampm').value;
                pkgStr = 'Airport Transfer';
            }

            document.getElementById('modal-summary-pickup').innerText = pickupLoc;
            document.getElementById('modal-summary-dest').innerText = destLoc;
            const destinationLabel = document.getElementById('modal-summary-dest-label');
            const tripTypeRow = document.getElementById('modal-summary-trip-type-row');
            const tripTypeValue = document.getElementById('modal-summary-trip-type');
            const exclusions = document.getElementById('modal-summary-exclusions');
            const extraNote = document.getElementById('modal-summary-extra-note');
            if (destinationLabel) destinationLabel.textContent = currentWDSubTab === 'local' ? 'Trip Type:' : 'Destination / Route:';
            if (currentWDSubTab === 'local') document.getElementById('modal-summary-dest').innerText = 'Local City';
            if (tripTypeRow) tripTypeRow.classList.toggle('hidden', currentWDSubTab !== 'outstation');
            if (tripTypeValue) tripTypeValue.textContent = currentOutstationJourneyType === 'one-way' ? 'One-way' : 'Round trip';
            if (exclusions) exclusions.textContent = currentWDSubTab === 'outstation'
                ? '✕ Extra charges: Tolls, parking and applicable state taxes are charged at actual cost.'
                : '✕ Extra charges: Tolls and parking are charged at actual cost.';
            if (extraNote) extraNote.textContent = currentWDSubTab === 'outstation'
                ? 'Tolls, parking and applicable state taxes extra at actual cost.'
                : 'Tolls and parking extra at actual cost.';
            document.getElementById('modal-summary-datetime').innerText = dateTimeStr;
            document.getElementById('modal-summary-datetime').previousElementSibling.hidden = currentWDSubTab === 'outstation';
            document.getElementById('modal-summary-package').innerText = pkgStr;

            document.getElementById('booking-modal').classList.remove('hidden'); syncModalState(document.getElementById('booking-modal'), true);
        }

        function renderFirstTripOffer(animate = false) {
            const fare = document.getElementById('modal-fare');
            const original = document.getElementById('modal-original-fare');
            const button = document.getElementById('first-trip-offer-button');
            const label = document.getElementById('first-trip-offer-button-label');
            const icon = document.getElementById('first-trip-offer-icon');
            const badge = document.getElementById('first-trip-offer-badge');
            const status = document.getElementById('first-trip-offer-status');
            const breakdown = document.getElementById('first-trip-offer-breakdown');
            const amount = document.getElementById('first-trip-offer-amount');
            const discount = Math.round(firstTripFareBeforeDiscount * 0.05);
            chosenFareAmount = firstTripOfferApplied ? firstTripFareBeforeDiscount - discount : firstTripFareBeforeDiscount;
            if (fare) fare.textContent = '₹' + chosenFareAmount.toLocaleString('en-IN');
            if (original) {
                original.textContent = '₹' + firstTripFareBeforeDiscount.toLocaleString('en-IN');
                original.classList.toggle('hidden', !firstTripOfferApplied);
            }
            if (button) {
                button.setAttribute('aria-pressed', String(firstTripOfferApplied));
                if (animate) {
                    button.classList.remove('first-trip-offer-applied');
                    void button.offsetWidth;
                    button.classList.add('first-trip-offer-applied');
                    window.setTimeout(() => button.classList.remove('first-trip-offer-applied'), 550);
                }
            }
            if (icon) icon.textContent = firstTripOfferApplied ? '✓' : '🎁';
            if (badge) badge.textContent = 'FIRST TRIP 5% OFF';
            if (badge) badge.classList.toggle('first-trip-offer-badge-applied', firstTripOfferApplied);
            if (label) label.textContent = firstTripOfferApplied ? 'OFFER APPLIED · TAP TO REMOVE' : 'TAP TO APPLY';
            if (status) status.textContent = firstTripOfferApplied
                ? 'Offer applied to the estimated fare. We’ll confirm eligibility after mobile OTP; actual tolls, parking and applicable taxes are not discounted.'
                : 'Tap to apply. We’ll verify first-trip eligibility after mobile OTP. Tolls, parking and applicable taxes stay extra.';
            if (breakdown) breakdown.classList.toggle('hidden', !firstTripOfferApplied);
            if (amount) amount.textContent = '−₹' + discount.toLocaleString('en-IN');
        }

        function toggleFirstTripOffer() {
            if (firstTripOfferApplied) {
                firstTripOfferApplied = false;
                renderFirstTripOffer();
            } else {
                applyFirstTripOffer();
            }
        }

        function applyFirstTripOffer() {
            if (firstTripOfferApplied) return;
            firstTripOfferApplied = true;
            renderFirstTripOffer(true);
            celebrateFirstTripOffer();
        }

        function celebrateFirstTripOffer() {
            if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
            const layer = document.createElement('div');
            layer.className = 'first-trip-confetti-layer';
            layer.setAttribute('aria-hidden', 'true');
            const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444'];
            for (let i = 0; i < 64; i++) {
                const piece = document.createElement('span');
                piece.className = 'first-trip-confetti-piece';
                piece.style.left = `${Math.random() * 100}%`;
                piece.style.setProperty('--confetti-drift', `${Math.round(Math.random() * 220 - 110)}px`);
                piece.style.setProperty('--confetti-spin', `${Math.round(Math.random() * 900 - 450)}deg`);
                piece.style.setProperty('--confetti-delay', `${Math.random() * 420}ms`);
                piece.style.backgroundColor = colors[i % colors.length];
                layer.appendChild(piece);
            }
            document.body.appendChild(layer);
            window.setTimeout(() => layer.remove(), 2400);
        }
        function closeModal() { document.getElementById('booking-modal').classList.add('hidden'); syncModalState(document.getElementById('booking-modal'), false); }

        function openSDModal(car) {
            selectedCarObj = car;
            selfDriveCurrentLocation = null;
            selfDriveDeliverySelection = null;
            const locationStatus = document.getElementById('sd-current-location-status');
            if (locationStatus) locationStatus.textContent = '';
            document.getElementById('sd-modal-car-brand').innerText = car.brand;
            document.getElementById('sd-modal-car-name').innerText = car.fullName;
            document.getElementById('sd-modal-car-rate').innerText = car.rateHour;

            const pDate = document.getElementById('sd-pdate').value;
            const pHour = document.getElementById('sd-phour').value;
            const pAmpm = document.getElementById('sd-pampm').value;
            const rDate = document.getElementById('sd-rdate').value;
            const rHour = document.getElementById('sd-rhour').value;
            const rAmpm = document.getElementById('sd-rampm').value;

            document.getElementById('sd-review-pdatetime').innerText = `${pDate || 'Selected'} @ ${pHour}:00 ${pAmpm}`;
            document.getElementById('sd-review-rdatetime').innerText = `${rDate || 'Selected'} @ ${rHour}:00 ${rAmpm}`;

            updateSDFareReview();
            document.getElementById('sd-booking-modal').classList.remove('hidden'); syncModalState(document.getElementById('sd-booking-modal'), true);
        }
        function closeSDModal() { document.getElementById('sd-booking-modal').classList.add('hidden'); syncModalState(document.getElementById('sd-booking-modal'), false); }

        function openPartnerModal() { document.getElementById('partner-modal').classList.remove('hidden'); syncModalState(document.getElementById('partner-modal'), true); }
        function closePartnerModal() { document.getElementById('partner-modal').classList.add('hidden'); syncModalState(document.getElementById('partner-modal'), false); }

        window.showSuccessModal = function(applicationNumber, notifications = {}, isBooking = false) {
            const modal = document.getElementById('success-confirmation-modal');
            const idBox = document.getElementById('success-application-id');
            const idText = document.getElementById('success-application-number');
            const message = modal.querySelector('h3 + p');

            message.textContent = notifications.customer_email_sent
                ? 'Thank you! An acknowledgement has been sent to your email. Our team will connect with you shortly.'
                : 'Thank you! Your details have been submitted. An email acknowledgement could not be sent. Please keep your reference number.';

            if (isBooking && !notifications.upload_url) {
                modal.querySelector('h3').textContent = 'Booking Request Received!';
                message.textContent = 'No payment is required right now. Our team will verify car availability and contact you shortly.';
            } else {
                modal.querySelector('h3').textContent = notifications.upload_url ? 'Booking Request Received' : 'Enquiry Successfully Submitted!';
            }

            if (isBooking && !notifications.admin_email_sent) {
                message.textContent += ' If you do not hear from us shortly, please contact carwithdriver.vikhroli@gmail.com with your Booking ID.';
            }

            idBox.querySelector('div').textContent = isBooking ? 'Booking ID' : 'Application ID';
            modal.querySelector('[data-document-upload]')?.remove();

            if (notifications.upload_url) {
                message.textContent = 'Your Self Drive booking request has been received. Please upload your documents for manual verification. Uploading documents does not confirm your booking. Our team will verify them and contact you.' + (notifications.customer_email_sent ? ' A secure upload link has been sent to your email.' : ' Please save the upload link below; the email acknowledgement could not be sent.');
                const link = document.createElement('a');
                link.dataset.documentUpload = 'true';
                link.href = notifications.upload_url;
                link.textContent = 'Upload Documents';
                link.className = 'block w-full bg-indigo-950 text-white font-bold rounded-xl px-4 py-3 text-sm';
                idBox.after(link);
            }

            if (applicationNumber) {
                idText.textContent = applicationNumber;
                idBox.classList.remove('hidden');
            } else {
                idBox.classList.add('hidden');
            }

            modal.classList.remove('hidden');
            syncModalState(modal, true);
        };
        
        function closeSuccessModal() { document.getElementById('success-confirmation-modal').classList.add('hidden'); syncModalState(document.getElementById('success-confirmation-modal'), false); }

        function onSDDeliveryOptionChange() {
            currentDeliveryMode = document.querySelector('input[name="sd-delivery-mode"]:checked').value;
            const homeBox = document.getElementById('sd-home-delivery-box');
            if (currentDeliveryMode === 'home') homeBox.classList.remove('hidden');
            else homeBox.classList.add('hidden');
            updateSDFareReview();
        }

        function updateSDFareReview() {
            if (!selectedCarObj) return;
            const pickupDateTime = createLocalDateTime(
                document.getElementById('sd-pdate').value,
                Number(document.getElementById('sd-phour').value),
                document.getElementById('sd-pampm').value
            );
            const returnDateTime = createLocalDateTime(
                document.getElementById('sd-rdate').value,
                Number(document.getElementById('sd-rhour').value),
                document.getElementById('sd-rampm').value
            );
            calculatedRentalHours = (returnDateTime - pickupDateTime) / (60 * 60 * 1000);
            const billedRentalHours = Math.max(24, calculatedRentalHours);
            document.getElementById('sd-review-duration').innerText =
                `${calculatedRentalHours} hours actual · ${billedRentalHours} hours billed (24-hour minimum)`;
            const baseFare = billedRentalHours * selectedCarObj.rateVal;
            const deposit = selectedCarObj.depositVal;
            
            let deliveryCharge = 0;
            if (currentDeliveryMode === 'home') {
                const locInput = document.getElementById('sd-delivery-location-input').value.trim();
                const oneWayKm = Number(selfDriveDeliverySelection?.oneWayKm);
                if (!selfDriveDeliverySelection || !Number.isFinite(oneWayKm)) {
                    document.getElementById('sd-review-delivery-charge-row').style.display = 'flex';
                    document.getElementById('sd-review-delivery-charge').innerText = '₹0';
                    document.getElementById('sd-review-deliv-mode').innerText = 'Home Delivery';
                    document.getElementById('sd-review-deliv-location-row').style.display = locInput ? 'block' : 'none';
                    if (locInput) document.getElementById('sd-review-deliv-location').innerText = locInput;
                } else {
                    const totalDeliveryKm = oneWayKm * 2;
                    deliveryCharge = livePricingRules.baseDeliveryCharge +
                        Math.max(0, totalDeliveryKm - livePricingRules.freeThresholdKm) * livePricingRules.extraDeliveryChargePerKm;
                    document.getElementById('sd-review-delivery-charge-row').style.display = 'flex';
                    document.getElementById('sd-review-delivery-charge').innerText = `₹${deliveryCharge.toLocaleString('en-IN')}`;
                    document.getElementById('sd-review-deliv-mode').innerText = 'Home Delivery';
                    document.getElementById('sd-review-deliv-location-row').style.display = 'block';
                    document.getElementById('sd-review-deliv-location').innerText = selfDriveDeliverySelection.address || locInput;
                }
            } else {
                deliveryCharge = 0;
                document.getElementById('sd-review-delivery-charge-row').style.display = 'none';
                document.getElementById('sd-review-deliv-mode').innerText = 'Self Pick-up';
                document.getElementById('sd-review-deliv-location-row').style.display = 'none';
            }

            const total = baseFare + deposit + deliveryCharge;

            document.getElementById('sd-review-base-fare').innerText = `₹${baseFare.toLocaleString('en-IN')}`;
            document.getElementById('sd-review-deposit').innerText = `₹${deposit.toLocaleString('en-IN')}`;
            document.getElementById('disp-total-final-fare').innerText = `₹${total.toLocaleString('en-IN')}`;
            return true;
        }

async function onSelfDriveGooglePlaceSelected(place) {
    const input = document.getElementById('sd-delivery-location-input');
    if (!input || !place?.placeId) return;
    const status = document.getElementById('sd-current-location-status');
    try {
        if (status) {
            status.textContent = 'Checking delivery location…';
            status.className = 'text-[10px] text-slate-500 mt-1';
        }
        const [details, route] = await Promise.all([
            publicMapsRequest('place-details', { placeId: place.placeId }),
            publicMapsRequest('delivery-route', { placeId: place.placeId })
        ]);
        const oneWayKm = Number(route.oneWayDistanceKm);
        if (!Number.isFinite(oneWayKm) || oneWayKm > 50) {
            selfDriveDeliverySelection = null;
            input.dataset.googlePlaceId = '';
            showCustomAlert('Sorry, this delivery location is outside our current Self Drive home-delivery service area.');
            return;
        }
        selfDriveDeliverySelection = {
            placeId: place.placeId,
            address: details.address || place.text || place.mainText || '',
            city: details.city || '',
            state: details.state || '',
            postalCode: details.postalCode || '',
            oneWayKm
        };
        input.value = details.address || place.text || place.mainText || '';
        document.getElementById('sd-cust-address').value = details.address || '';
        document.getElementById('sd-cust-city').value = details.city || '';
        document.getElementById('sd-cust-state').value = details.state || '';
        document.getElementById('sd-cust-pincode').value = details.postalCode || '';
        if (status) {
            status.textContent = '✓ Delivery location selected from Google';
            status.className = 'text-[10px] text-emerald-700 font-semibold mt-1';
        }
        updateSDFareReview();
    } catch (error) {
        selfDriveDeliverySelection = null;
        if (status) {
            status.textContent = error.message || 'Unable to verify this delivery location.';
            status.className = 'text-[10px] text-rose-600 mt-1';
        }
    }
}

function onDeliveryLocationSelect() {
    const input = document.getElementById('sd-delivery-location-input');
    if (!input) return;
    if (input.dataset.googlePlaceId && selfDriveDeliverySelection?.placeId === input.dataset.googlePlaceId) return;
    selfDriveDeliverySelection = null;
    input.dataset.googlePlaceId = '';
    updateSDFareReview();
}

function closeSDServiceabilityModal() {
    const modal = document.getElementById('sd-serviceability-modal');
    modal.classList.add('hidden');
    syncModalState(modal, false);
    modal.classList.remove('flex');

    document.getElementById('sd-delivery-location-input').focus();
}

        function handleBrandDropdownChange(val) {
            const customInput = document.getElementById('part-car-brand-custom');
            if (val === 'Brand Not Listed') {
                customInput.classList.remove('hidden');
                customInput.required = true;
            } else {
                customInput.classList.add('hidden');
                customInput.required = false;
                customInput.value = '';
            }
        }

        function createLocalDateTime(dateValue, hour, ampm) {
    const [year, month, day] = dateValue.split('-').map(Number);

    let hour24 = hour;

    if (ampm === 'AM' && hour === 12) {
        hour24 = 0;
    } else if (ampm === 'PM' && hour !== 12) {
        hour24 = hour + 12;
    }

    return new Date(year, month - 1, day, hour24, 0, 0);
}

function getOrdinalSuffix(day) {
    if (day >= 11 && day <= 13) return 'th';

    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}

function formatBookingDateTime(date) {
    const day = date.getDate();
    const month = date.toLocaleString('en-IN', { month: 'short' });
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    if (hours === 0) hours = 12;

    return `${day}${getOrdinalSuffix(day)} ${month} ${year}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

function formatDuration(hours) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    const parts = [];

    if (days > 0) {
        parts.push(`${days} Day${days > 1 ? 's' : ''}`);
    }

    if (remainingHours > 0) {
        parts.push(`${remainingHours} Hour${remainingHours > 1 ? 's' : ''}`);
    }

    return parts.join(', ') || '0 Hours';
}

function generateBookingId() {
    const now = new Date();

    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');

    const random = Math.floor(1000 + Math.random() * 9000);

    return `CWD-WD-${yy}${mm}${dd}-${random}`;
}

async function handleBookingSubmit(e) {
    e.preventDefault();
    if (!validateJourneyAndOpenBooking()) return;
    if (!e.target.reportValidity()) return;
    let otpProof;
    try {
        const otp = await mobileOtpReady;
        if (!otp) throw new Error('Mobile verification could not load. Please refresh and retry.');
        otpProof = await otp.requestFormOtp(e.target, 'cust-phone', 'booking');
    } catch (error) { if (!error.cancelled) showCustomAlert(error.message); return; }

    const name = document.getElementById('cust-name').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const email = document.getElementById('cust-email').value.trim();
    const address = document.getElementById('cust-address').value.trim();
    const currentLocationText = withDriverCurrentLocation
        ? `\n📍 Exact GPS: ${withDriverCurrentLocation.mapUrl}\nGPS Address: ${withDriverCurrentLocation.address || 'Captured'}`
        : '';

    const car = wdFleet.find(c => c.name === chosenCarName);
    const bookingId = e.target.dataset.bookingId || (e.target.dataset.bookingId = generateBookingId());

    let message = '';
    let subject = '';
    let bookingData = null;

    // =========================
    // LOCAL CITY
    // =========================
    if (currentWDSubTab === 'local') {

        const pickupLocation = document.getElementById('wd-local-pickup').value.trim();
        const packageValue = document.getElementById('wd-local-package').value;

        const startDate = document.getElementById('wd-local-date').value;
        const startHour = parseInt(document.getElementById('wd-local-hour').value);
        const startAmPm = document.getElementById('wd-local-ampm').value;

        const extraKmRate = car?.rates?.local?.extraKm || 0;

        const packageMap = {
            '8hr_80km': { label: '8 Hours / 80 KM', hours: 8 },
            '12hr_120km': { label: '12 Hours / 120 KM', hours: 12 }
        };

        const selectedPackage = packageMap[packageValue] || {
            label: packageValue,
            hours: 8
        };

        const startDateTime = createLocalDateTime(
            startDate,
            startHour,
            startAmPm
        );

        const endDateTime = new Date(
            startDateTime.getTime() + selectedPackage.hours * 60 * 60 * 1000
        );


        message = `
🚨 LOCAL CITY | ${bookingId}

👤 ${name} | ${phone}
🚗 ${chosenCarName} | ₹${chosenFareAmount.toLocaleString('en-IN')}
📍 ${pickupLocation} — ${address}
📅 ${formatBookingDateTime(startDateTime)} – ${formatBookingDateTime(endDateTime)}
⏱ ${selectedPackage.label}
💰 Extra: ₹${extraKmRate}/KM

✓ Incl: Fuel, Driver
✕ Excl: Toll, Parking, State Tax
`;

        subject = `New booking assigned to your car – ${chosenCarName}`;
        bookingData = {tripType:'local',carName:chosenCarName,pickupAt:startDateTime.toISOString(),pickupLocation,pickupPlaceId:document.getElementById('wd-local-pickup').dataset.googlePlaceId||'',localPackage:packageValue};
    }

    // =========================
    // OUTSTATION
    // =========================
    else if (currentWDSubTab === 'outstation') {

        const selections = collectOutstationRouteSelections(true);
        const pickupLocation = selections.pickup.address || selections.pickup.name;
        const destination = selections.finalDrop.address || selections.finalDrop.name;
        const stopNames = selections.stops.map(stop => stop.address || stop.name);

        const pickupDate = document.getElementById('wd-out-pdate').value;
        const pickupHour = parseInt(document.getElementById('wd-out-phour').value);
        const pickupAmPm = document.getElementById('wd-out-pampm').value;

        const returnDate = document.getElementById('wd-out-rdate').value;
        const returnHour = parseInt(document.getElementById('wd-out-rhour').value);
        const returnAmPm = document.getElementById('wd-out-rampm').value;

        const extraKmRate = car?.rates?.outstationPerKm || 0;
        const driverAllowance = OUTSTATION_DRIVER_ALLOWANCE_PER_DAY;

        const startDateTime = createLocalDateTime(
            pickupDate,
            pickupHour,
            pickupAmPm
        );

        const returnDateTime = createLocalDateTime(
            returnDate,
            returnHour,
            returnAmPm
        );

        const includedKm = Math.max(
            wdOutstationKm,
            wdOutstationDays * livePricingRules.minimumOutstationKmPerDay
        );
        const routeText = [
            'Vikhroli Base',
            selections.pickup.name,
            ...selections.stops.map(stop => stop.name),
            selections.finalDrop.name,
            'Vikhroli Base'
        ].join(' → ');

        message = `
🚨 OUTSTATION | ${bookingId}

👤 ${name} | ${phone}
🚗 ${chosenCarName} | ₹${chosenFareAmount.toLocaleString('en-IN')}
🔁 Trip Type: ${currentOutstationJourneyType === 'one-way' ? 'One-way' : 'Round trip'}
📍 Vehicle Route: ${routeText}
📅 Start: ${formatBookingDateTime(startDateTime)}
📅 Final Drop: ${formatBookingDateTime(returnDateTime)}
⏱ ${wdOutstationDays} Day${wdOutstationDays > 1 ? 's' : ''} | ${includedKm.toLocaleString('en-IN')} km included
${currentOutstationJourneyType === 'one-way' ? '↩️ One-way fare includes the vehicle’s empty return distance; driver allowance applies to trip days only.\n' : ''}🗺 Route distance: ${wdOutstationRouteQuote?.distanceKmExact || wdOutstationKm} km
💰 ₹${extraKmRate}/KM | Driver ₹${driverAllowance}/Day
🌙 Night: ₹400 Hatchback/Sedan · ₹600 SUV/MUV when 11 PM–4 AM applies

✓ Incl: Fuel, Driver
✕ Excl: Toll, Parking, State Tax (as per actual)
`;

        subject = `New booking assigned to your car – ${chosenCarName}`;
        bookingData = {
            tripType: 'outstation',
            carName: chosenCarName,
            pickupAt: startDateTime.toISOString(),
            returnAt: returnDateTime.toISOString(),
            journeyType: currentOutstationJourneyType,
            pickupLocation,
            pickupPlaceId: selections.pickup.placeId,
            destination,
            destinationPlaceId: selections.finalDrop.placeId,
            stops: selections.stops.map(stop => ({
                name: stop.name,
                address: stop.address,
                placeId: stop.placeId
            })),
            clientRouteKm: wdOutstationRouteQuote?.distanceKmExact || wdOutstationKm
        };
    }

    // =========================
    // AIRPORT
    // =========================
    else if (currentWDSubTab === 'airport') {

        const airport = document.getElementById('wd-airport-terminal').value;

        const airportNames = {
            t1: 'Mumbai Airport T1',
            t2: 'Mumbai Airport T2',
            nmia: 'Navi Mumbai International Airport'
        };

        const airportName = airportNames[airport] || airport;

        const location = document.getElementById('wd-airport-pickup').value.trim();

        const date = document.getElementById('wd-airport-date').value;
        const hour = parseInt(document.getElementById('wd-airport-hour').value);
        const ampm = document.getElementById('wd-airport-ampm').value;

        const journeyDateTime = createLocalDateTime(
            date,
            hour,
            ampm
        );
        const flightNumber = currentAirportType === 'pickup'
            ? (document.getElementById('wd-airport-flight-number')?.value || '').trim().replace(/[^A-Za-z0-9 -]/g, '').slice(0, 30)
            : '';


        if (currentAirportType === 'drop') {

            message = `
🚨 AIRPORT DROP | ${bookingId}

👤 ${name} | ${phone}
🚗 ${chosenCarName} | ₹${chosenFareAmount.toLocaleString('en-IN')}
📍 Pickup: ${location} — ${address}
✈️ ${airportName}
📅 ${formatBookingDateTime(journeyDateTime)}

✓ Incl: Fuel, Driver
✕ Excl: Toll, Parking
`;

        } else {

            message = `
🚨 AIRPORT PICKUP | ${bookingId}

👤 ${name} | ${phone}
🚗 ${chosenCarName} | ₹${chosenFareAmount.toLocaleString('en-IN')}
✈️ From: ${airportName}
📍 Drop: ${location} — ${address}
${flightNumber ? `🛫 Flight: ${flightNumber}\n` : ''}📅 ${formatBookingDateTime(journeyDateTime)}

✓ Incl: Fuel, Driver
✕ Excl: Toll, Parking
`;
        }

        subject = `New booking assigned to your car – ${chosenCarName}`;
        bookingData = {tripType:'airport',carName:chosenCarName,pickupAt:journeyDateTime.toISOString(),pickupLocation:location,customerPlaceId:document.getElementById('wd-airport-pickup').dataset.googlePlaceId||'',pickupPlaceId:currentAirportType==='drop'?(document.getElementById('wd-airport-pickup').dataset.googlePlaceId||''):'',airportTerminal:airport,airportType:currentAirportType,flightNumber:flightNumber||null};
    }

    bookingData = {
        ...bookingData,
        ...(firstTripOfferApplied ? { couponCode: 'FIRSTTRIP' } : {}),
        customerAddress: address,
        currentLocation: withDriverCurrentLocation ? {
            latitude: withDriverCurrentLocation.latitude,
            longitude: withDriverCurrentLocation.longitude,
            address: withDriverCurrentLocation.address,
            mapUrl: withDriverCurrentLocation.mapUrl
        } : null
    };
    await sendWithDriverBookingEmail(e.target, bookingId, name, phone, email,
        message + '\nCustomer address: ' + address + currentLocationText, closeModal, 'withdriver', otpProof, bookingData);
}
        async function handleSDBookingSubmit(e) {
            e.preventDefault();
            if (!validateSelfDriveJourney()) return;
            if (!e.target.reportValidity()) return;
            const primaryPhone = document.getElementById('sd-cust-phone').value.trim().replace(/\D/g, '').slice(-10);
            const alternatePhone = document.getElementById('sd-cust-alt-phone').value.trim().replace(/\D/g, '').slice(-10);
            if (alternatePhone && primaryPhone === alternatePhone) {
                showCustomAlert('Alternate mobile number must be different from the primary mobile number.');
                document.getElementById('sd-cust-alt-phone').focus();
                return;
            }
            updateSDFareReview();
            if (currentDeliveryMode === 'home') {
                const deliveryInput = document.getElementById('sd-delivery-location-input');
                if (!selfDriveDeliverySelection?.placeId || deliveryInput.dataset.googlePlaceId !== selfDriveDeliverySelection.placeId) {
                    showCustomAlert('Please select the delivery location from Google suggestions.');
                    deliveryInput.focus();
                    return;
                }
            }
            let otpProof;
            try {
                const otp = await mobileOtpReady;
                if (!otp) throw new Error('Mobile verification could not load. Please refresh and retry.');
                otpProof = await otp.requestFormOtp(e.target, 'sd-cust-phone', 'booking');
            } catch (error) { if (!error.cancelled) showCustomAlert(error.message); return; }
            const name = document.getElementById('sd-cust-name').value.trim();
            const phone = document.getElementById('sd-cust-phone').value.trim();
            const email = document.getElementById('sd-cust-email').value.trim();
            const bookingId = e.target.dataset.bookingId || (e.target.dataset.bookingId = generateBookingId());
            const text = id => document.getElementById(id).innerText;
            const value = id => document.getElementById(id).value.trim();
            const details = [
                ['Service', 'Self Drive'], ['Car', selectedCarObj.fullName],
                ['Brand', selectedCarObj.brand], ['Rental rate', selectedCarObj.rateHour],
                ['Pickup', value('sd-pdate') + ' ' + value('sd-phour') + ':00 ' + value('sd-pampm')],
                ['Return', value('sd-rdate') + ' ' + value('sd-rhour') + ':00 ' + value('sd-rampm')],
                ['Duration', text('sd-review-duration')],
                ['Delivery Mode', text('sd-review-deliv-mode')],
                ['Delivery Location', currentDeliveryMode === 'home' ? value('sd-delivery-location-input') : 'Self Pick-up'],
                ['Alternate Mobile', value('sd-cust-alt-phone')],
                ['Address', currentDeliveryMode === 'home' ? [value('sd-cust-address'), value('sd-cust-city'), value('sd-cust-state'), value('sd-cust-pincode')].join(', ') : 'Self Pick-up'],
                ['Exact GPS', currentDeliveryMode === 'home' && selfDriveCurrentLocation ? selfDriveCurrentLocation.mapUrl : 'Not provided'],
                ['Base Rental Fare', text('sd-review-base-fare')],
                ['Security Deposit', text('sd-review-deposit')],
                ['Delivery Charge', currentDeliveryMode === 'home' ? text('sd-review-delivery-charge') : '0'],
                ['Total Amount', text('disp-total-final-fare')],
            ].map(([label, v]) => label + ': ' + (v || 'Not provided')).join('\n');
            const bookingData = {vehicleId:selectedCarObj.id,pickupAt:createLocalDateTime(value('sd-pdate'),Number(value('sd-phour')),value('sd-pampm')).toISOString(),returnAt:createLocalDateTime(value('sd-rdate'),Number(value('sd-rhour')),value('sd-rampm')).toISOString(),deliveryMode:currentDeliveryMode,deliveryLocation:currentDeliveryMode==='home'?value('sd-delivery-location-input'):'Self Pick-up',deliveryPlaceId:currentDeliveryMode==='home'?selfDriveDeliverySelection?.placeId:null,deliveryDistanceKm:currentDeliveryMode==='home'?selfDriveDeliverySelection?.oneWayKm:null,currentLocation:currentDeliveryMode==='home'&&selfDriveCurrentLocation?{latitude:selfDriveCurrentLocation.latitude,longitude:selfDriveCurrentLocation.longitude,address:selfDriveCurrentLocation.address,mapUrl:selfDriveCurrentLocation.mapUrl}:null};
            await sendEmailNotification(e.target, bookingId, name, phone, email, details, closeSDModal, 'selfdrive', otpProof, bookingData);
        }

let lastPartnerForm = null;

function showPartnerUploadProgress() {
    let modal = document.getElementById('partner-upload-progress-modal');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'partner-upload-progress-modal';

        modal.className =
            'fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[10000] flex items-center justify-center px-4';

        modal.innerHTML = `
            <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center">

                <div class="mx-auto mb-4 w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center">
                    <i class="fa-solid fa-cloud-arrow-up text-indigo-700 text-xl"></i>
                </div>

                <h3 id="partner-progress-title"
                    class="text-lg font-extrabold text-slate-900">
                    Uploading Documents
                </h3>

                <p id="partner-progress-text"
                   class="text-xs text-slate-500 mt-1 mb-5">
                    Please keep this window open.
                </p>

                <div class="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                    <div id="partner-progress-bar"
                         class="bg-indigo-700 h-3 rounded-full transition-all duration-200"
                         style="width:0%">
                    </div>
                </div>

                <div class="flex items-center justify-between mt-2">
                    <span id="partner-progress-status"
                          class="text-[10px] font-semibold text-slate-500">
                        Starting upload...
                    </span>

                    <span id="partner-progress-percent"
                          class="text-sm font-extrabold text-indigo-950">
                        0%
                    </span>
                </div>

            </div>
        `;

        document.body.appendChild(modal);
    }

    modal.classList.remove('hidden');
    syncModalState(modal, true);
    modal.classList.add('flex');

    return modal;
}

function updatePartnerProgress(percent, title, text, status) {
    const bar = document.getElementById('partner-progress-bar');
    const percentText = document.getElementById('partner-progress-percent');
    const titleText = document.getElementById('partner-progress-title');
    const textEl = document.getElementById('partner-progress-text');
    const statusEl = document.getElementById('partner-progress-status');

    if (bar) bar.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
    if (titleText) titleText.textContent = title;
    if (textEl) textEl.textContent = text;
    if (statusEl) statusEl.textContent = status;
}

function hidePartnerUploadProgress() {
    const modal = document.getElementById('partner-upload-progress-modal');

    if (modal) {
        modal.classList.add('hidden');
    syncModalState(modal, false);
        modal.classList.remove('flex');
    }
}

function showPartnerErrorModal(message) {

    hidePartnerUploadProgress();

    let modal = document.getElementById('partner-error-modal');

    if (modal) { syncModalState(modal, false); modal.remove(); }

    modal = document.createElement('div');
    modal.id = 'partner-error-modal';

    modal.className =
        'fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[10001] flex items-center justify-center px-4';

    modal.innerHTML = `
        <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">

            <div class="text-center">

                <div class="mx-auto mb-4 w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                    <i class="fa-solid fa-triangle-exclamation text-red-600 text-xl"></i>
                </div>

                <h3 class="text-lg font-extrabold text-slate-900">
                    Submission Failed
                </h3>

                <div class="mt-3 bg-red-50 border border-red-100 rounded-xl p-3 text-left">
                    <p class="text-[11px] text-red-800 leading-relaxed">
                        ${String(message || 'Something went wrong. Please try again.')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')}
                    </p>
                </div>

            </div>

            <div class="mt-5 space-y-2">

                <button
                    type="button"
                    id="partner-reupload-btn"
                    class="w-full bg-indigo-950 hover:bg-indigo-900 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2">
                    <i class="fa-solid fa-file-arrow-up"></i>
                    Re-upload Documents
                </button>

                <a
                    href="https://wa.me/919702988465"
                    target="_blank"
                    class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2">
                    <i class="fa-brands fa-whatsapp"></i>
                    Contact Customer Support
                </a>

                <button
                    type="button"
                    id="partner-error-close"
                    class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition">
                    Close
                </button>

            </div>

        </div>
    `;

    document.body.appendChild(modal);
    syncModalState(modal, true);
 
        
    document.getElementById('partner-reupload-btn').onclick = function () {
        syncModalState(modal, false);
        modal.remove();

        const partnerModal = document.getElementById('partner-modal');

        if (partnerModal) {
            partnerModal.scrollTop = 0;
        }

        const firstDocument = document.getElementById('part-rc');

        if (firstDocument) {
            firstDocument.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    };

    document.getElementById('partner-error-close').onclick = function () {
        syncModalState(modal, false);
        modal.remove();
    };
}


async function handlePartnerFormSubmit(e) {

    e.preventDefault();

    if (e.target.dataset.submitting === 'true') return;
    if (!e.target.reportValidity()) return;
    if (!window.preparePartnerFiles()) return;

    const partnerPrimaryPhone = document.getElementById('part-phone').value.trim().replace(/\D/g, '').slice(-10);
    const partnerAlternatePhone = document.getElementById('part-alt-phone').value.trim().replace(/\D/g, '').slice(-10);
    if (partnerAlternatePhone && partnerPrimaryPhone === partnerAlternatePhone) {
        showCustomAlert('Alternate mobile number must be different from the primary mobile number.');
        document.getElementById('part-alt-phone').focus();
        return;
    }

    const requiredPartnerDocs = (window.docFields || []).map(field => ({...field, file: document.getElementById(field.id)?.files?.[0]}));
    const missingBeforeOtp = requiredPartnerDocs.filter(item => !item.file);
    if (missingBeforeOtp.length) {
        showPartnerErrorModal('Please upload the following mandatory document' + (missingBeforeOtp.length > 1 ? 's' : '') + ':\n\n' + missingBeforeOtp.map(item => item.label).join(', '));
        document.getElementById(missingBeforeOtp[0].id)?.parentElement?.scrollIntoView({behavior:'smooth',block:'center'});
        return;
    }

    let otpProof;
    try {
        const otp = await mobileOtpReady;
        if (!otp) throw new Error('Mobile verification could not load. Please refresh and retry.');
        otpProof = await otp.requestFormOtp(e.target, 'part-phone', 'partner');
    } catch (error) { if (!error.cancelled) showCustomAlert(error.message); return; }
    e.target.dataset.submitting = 'true';
    lastPartnerForm = e.target;

    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;

    /*
     * First prepare compressed files and validate total size.
     */
    submitButton.disabled = true;
    submitButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin mr-2"></i>
        Checking Files...
    `;


    try {

        const name = document.getElementById('part-name').value.trim();
        const phone = document.getElementById('part-phone').value.trim();
        const email = document.getElementById('part-email').value.trim();
        const alternatePhone = document.getElementById('part-alt-phone').value.trim();

        let brand = document.getElementById('part-car-brand-select').value;

        if (brand === 'Brand Not Listed') {
            brand = document.getElementById('part-car-brand-custom').value.trim();
        }

        const model = document.getElementById('part-car-model').value.trim();
        const year = document.getElementById('part-car-year').value;

        const files = [
            document.getElementById('part-rc').files[0],
            document.getElementById('part-insurance').files[0],
            document.getElementById('part-puc').files[0],
            document.getElementById('part-dl').files[0],
            document.getElementById('part-aadhaar').files[0],
            document.getElementById('part-pan').files[0]
        ];

        const vehiclePhotos = Array.from(
            document.getElementById('part-vehicle-photos').files
        );

        /*
         * Maximum 4 vehicle photos
         */
        if (vehiclePhotos.length > 4) {
            throw new Error('Please upload maximum 4 vehicle photos.');
        }

        /*
         * Allowed file types
         */
        const allowedDocuments = [
            'image/jpeg',
            'image/png',
            'application/pdf'
        ];

        const allowedPhotos = [
            'image/jpeg',
            'image/png',
            'image/webp'
        ];

        /*

/*
 * Validate required documents
 */
const missingDocuments = [];

files.forEach((file, index) => {
    const field = docFields[index];

    if (!file) {
        missingDocuments.push(field);
        
        const input = document.getElementById(field.id);
        const wrapper = input?.parentElement;
        const button = wrapper?.querySelector('button');
        const label = wrapper?.querySelector('label');

        if (wrapper) {
            wrapper.classList.add('partner-document-missing');
        }

        if (button) {
            button.classList.remove(
                'border-slate-300',
                'bg-white'
            );

            button.classList.add(
                'border-red-500',
                'bg-red-50',
                'ring-2',
                'ring-red-200'
            );
        }

        if (label) {
            label.classList.add('text-red-600');
        }

        return;
    }

    if (!allowedDocuments.includes(file.type)) {
        throw new Error(
            `${file.name}: Only JPG, PNG or PDF files are allowed.`
        );
    }
});

if (missingDocuments.length > 0) {

    const names = missingDocuments
        .map(item => item.label)
        .join(', ');

    const firstMissingInput =
        document.getElementById(missingDocuments[0].id);

    if (firstMissingInput) {
        firstMissingInput.parentElement?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }

    throw new Error(
        `Please upload the following mandatory document${missingDocuments.length > 1 ? 's' : ''}:\n\n${names}`
    );
}

        /*
         * Validate vehicle photos
         */
        for (const file of vehiclePhotos) {

            if (!allowedPhotos.includes(file.type)) {
                throw new Error(
                    `${file.name}: Only JPG, PNG or WEBP images are allowed.`
                );
            }
        }

        /*
         * Create FormData
         */
        const formData = new FormData();

        formData.append('name', name);
        formData.append('phone', phone);
        formData.append('otpProof', otpProof);
        formData.append('email', email);
        formData.append('alternate_phone', alternatePhone);
        formData.append('car_brand', brand);
        formData.append('car_model', model);
        formData.append('mfg_year', year);

        formData.append(
            'rc',
            document.getElementById('part-rc').files[0]
        );

        formData.append(
            'insurance',
            document.getElementById('part-insurance').files[0]
        );

        formData.append(
            'puc',
            document.getElementById('part-puc').files[0]
        );

        formData.append(
            'dl',
            document.getElementById('part-dl').files[0]
        );

        formData.append(
            'aadhaar',
            document.getElementById('part-aadhaar').files[0]
        );

        formData.append(
            'pan',
            document.getElementById('part-pan').files[0]
        );

        vehiclePhotos.forEach(file => {
            formData.append('vehicle_photos', file);
        });

        /*
         * Show Windows-style upload progress
         */
        showPartnerUploadProgress();

        updatePartnerProgress(
            0,
            'Uploading Documents',
            'Please keep this window open.',
            'Starting upload...'
        );

        submitButton.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin mr-2"></i>
            Uploading...
        `;

        /*
         * XMLHttpRequest gives real browser upload progress.
         */
        const result = await new Promise((resolve, reject) => {

            const xhr = new XMLHttpRequest();

            xhr.open(
                'POST',
                '/api/partner-application',
                true
            );

            xhr.upload.onprogress = function (event) {

                if (event.lengthComputable) {

                    /*
                     * Keep 10% reserved for server-side processing.
                     */
                    const uploadPercent = Math.round(
                        (event.loaded / event.total) * 90
                    );

                    updatePartnerProgress(
                        uploadPercent,
                        'Uploading Documents',
                        'Your documents are being securely uploaded.',
                        `${Math.round(event.loaded / 1024)} KB of ${Math.round(event.total / 1024)} KB`
                    );
                }
            };

            xhr.upload.onload = function () {

                updatePartnerProgress(
                    90,
                    'Securing Documents',
                    'Upload complete. Securing your documents...',
                    'Processing...'
                );
            };

            xhr.onload = function () {

                updatePartnerProgress(
                    95,
                    'Securing Documents',
                    'Saving your application securely...',
                    'Almost done...'
                );

                let responseData = {};

                try {
                    responseData = JSON.parse(xhr.responseText || '{}');
                } catch (error) {
                    responseData = {};
                }

                if (xhr.status >= 200 && xhr.status < 300 && responseData.success) {

                    resolve(responseData);

                } else {

                    reject(
                        new Error(
                            responseData.message ||
                            'Unable to submit partner application.'
                        )
                    );
                }
            };

            xhr.onerror = function () {

                reject(
                    new Error(
                        'Network error. Please check your internet connection and try again.'
                    )
                );
            };

            xhr.ontimeout = function () {

                reject(
                    new Error(
                        'The upload took too long. Please try again.'
                    )
                );
            };

            xhr.timeout = 120000;

            xhr.send(formData);
        });

        /*
         * SUCCESS
         */
        updatePartnerProgress(
            100,
            'Application Submitted',
            'Your partner application has been submitted successfully.',
            'Completed'
        );

        await new Promise(resolve => setTimeout(resolve, 700));

        hidePartnerUploadProgress();

        e.target.reset();

closePartnerModal();

showSuccessModal(result.application_number, result);

    } catch (error) {

        console.error(
            'Partner application error:',
            error
        );

        showPartnerErrorModal(
            error.message ||
            'Something went wrong. Please try again.'
        );

    } finally {

        e.target.dataset.submitting = 'false';
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
    }
}
        
        function showBookingSubmittingOverlay() {
            let overlay = document.getElementById('booking-submitting-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'booking-submitting-overlay';
                overlay.className = 'fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[10001] flex items-center justify-center px-4';
                overlay.innerHTML = '<div class="bg-white rounded-2xl shadow-2xl px-6 py-5 text-center"><i class="fa-solid fa-spinner fa-spin text-indigo-700 text-2xl mb-3"></i><div class="font-extrabold text-slate-900">Submitting your booking request...</div><div class="text-xs text-slate-500 mt-1">Please wait while we generate your Booking ID.</div></div>';
                document.body.appendChild(overlay);
            }
            overlay.classList.remove('hidden');
        }

        function hideBookingSubmittingOverlay() {
            document.getElementById('booking-submitting-overlay')?.classList.add('hidden');
        }

        function sendWithDriverBookingEmail(...args) {
            return sendEmailNotification(...args);
        }

        async function sendEmailNotification(form, bookingId, name, phone, email, details, closeBookingModal, serviceMode = 'withdriver', otpProof, bookingData) {
            if (form.dataset.submitting === 'true') return;
            form.dataset.submitting = 'true';
            const button = form.querySelector('button[type="submit"]');
            const originalButtonHtml = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Submitting Booking...';
            showBookingSubmittingOverlay();
            try {
                if (!otpProof) throw new Error('Please verify your mobile number before submitting.');
                const response = await fetch('/api/booking-enquiry', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bookingId, name, phone, email, details, serviceMode, otpProof, bookingData,
                        ...(serviceMode === 'selfdrive' ? { submissionKey: form.dataset.submissionKey || (form.dataset.submissionKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')) } : {}),
                    }),
                });
                const result = await response.json();
                if (response.status === 409) { delete form.dataset.bookingId; delete form.dataset.submissionKey; }
                if (!response.ok || !result.success) throw new Error(result.message || 'Unable to submit enquiry. Please try again.');
                showSuccessModal(result.booking_id, result, true);
                closeBookingModal();
                hideBookingSubmittingOverlay();
                delete form.dataset.bookingId;
                delete form.dataset.submissionKey;
            } catch (error) {
                hideBookingSubmittingOverlay();
                showCustomAlert(error.message || 'Unable to submit enquiry. Please try again.');
            } finally {
                form.dataset.submitting = 'false';
                button.disabled = false;
                button.innerHTML = originalButtonHtml;
            }
        }

        window.onload = function() {
            setWDSubTab('local');
            renderWDFleet();
            applyAllSDFilters();
        };

        function toggleFAQs() {
    const faqs = document.querySelectorAll('.faq-more');
    const button = document.getElementById('faq-toggle-btn');

    faqs.forEach(function(faq) {
        faq.classList.toggle('hidden');
    });

    if (button.innerText.includes('See More')) {
        button.innerHTML = 'See Less FAQs <i class="fa-solid fa-chevron-up"></i>';
    } else {
        button.innerHTML = 'See More FAQs <i class="fa-solid fa-chevron-down"></i>';
    }
}

const initializedDateInputs = new WeakSet();

function updateDatePlaceholder(inputId, placeholderId) {
    const input = document.getElementById(inputId);
    const placeholder = document.getElementById(placeholderId);

    if (!input || !placeholder) return;

    const timePrefix = {
        'wd-local-date': 'wd-local',
        'wd-out-pdate': 'wd-out-p',
        'wd-airport-date': 'wd-airport',
        'sd-pdate': 'sd-p'
    }[inputId];
    const hour = timePrefix && document.getElementById(timePrefix.endsWith('-p') ? timePrefix + 'hour' : timePrefix + '-hour');
    const ampm = timePrefix && document.getElementById(timePrefix.endsWith('-p') ? timePrefix + 'ampm' : timePrefix + '-ampm');

    function update() {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        input.min = input.min > today ? input.min : today;
        if (hour && ampm) {
            const available = (hourValue, period) => !input.value || input.value > today ||
                (input.value === today && createLocalDateTime(input.value, Number(hourValue), period) > now);
            const hours = [...hour.options];
            const periods = [...ampm.options];
            periods.forEach(option => { option.disabled = !hours.some(h => available(h.value, option.value)); });
            if (!periods.some(option => option.value === ampm.value && !option.disabled)) {
                ampm.value = periods.find(option => !option.disabled)?.value || '';
            }
            hours.forEach(option => { option.disabled = !ampm.value || !available(option.value, ampm.value); });
            if (!hours.some(option => option.value === hour.value && !option.disabled)) {
                hour.value = hours.find(option => !option.disabled)?.value || '';
            }
        }
        if (input.value) {
            input.classList.remove('date-empty');
            input.classList.add('date-filled');
            placeholder.style.display = 'none';
        } else {
            input.classList.remove('date-filled');
            input.classList.add('date-empty');
            placeholder.style.display = 'block';
        }
    }

    update();

    if (initializedDateInputs.has(input)) return;
    initializedDateInputs.add(input);
    input.addEventListener('change', update);
    input.addEventListener('input', update);
    for (const field of [input, hour, ampm].filter(Boolean)) {
        field.addEventListener('focus', update);
        field.addEventListener('pointerdown', update);
        if (field !== input) field.addEventListener('change', update);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    document.querySelectorAll('input[type="date"]').forEach(input => { input.min = today; });

    updateDatePlaceholder('sd-pdate', 'sd-pdate-placeholder');
    updateDatePlaceholder('sd-rdate', 'sd-rdate-placeholder');

    updateDatePlaceholder('wd-local-date', 'wd-local-date-placeholder');

    updateDatePlaceholder('wd-out-pdate', 'wd-out-pdate-placeholder');
    updateDatePlaceholder('wd-out-rdate', 'wd-out-rdate-placeholder');

    updateDatePlaceholder('wd-airport-date', 'wd-airport-date-placeholder');
});

        /* =========================================================
   WHY CHOOSE US MODAL
   ========================================================= */

const whyChooseData = {

    driver: {
        heading: "Experienced, Verified & Multi-Lingual Chauffeurs",
        icon: "fa-user-shield",
        details: [
            "<strong>Marathi, Hindi & English Speaking:</strong> Drivers fluent in Marathi, Hindi, and English, making local commuting, family trips, and corporate travel completely comfortable for everyone.",
            "<strong>Verified Background:</strong> All drivers are background-verified and possess valid commercial driving licenses.",
            "<strong>Polite & Courteous:</strong> Well-behaved and professionally dressed drivers trained to handle family trips and corporate travel smoothly.",
            "<strong>Route Experts:</strong> Deep knowledge of local city traffic routes, shortcuts, and outstation highways across Maharashtra and beyond.",
            "<strong>Safe Driving:</strong> Strict adherence to safety limits, with no rash driving or over-speeding."
        ]
    },

    pricing: {
        heading: "100% Transparent Fare Policy",
        icon: "fa-receipt",
        details: [
            "<strong>No Hidden Costs:</strong> What you see is what you pay. No last-minute surprises.",
            "<strong>Clear Breakup:</strong> Fare clearly segregates per-km/rental charges, driver allowance, and toll/parking terms.",
            "<strong>Flexible Billing:</strong> Easy options for local packages, outstation trips, and airport transfers.",
            "<strong>Simple Invoices:</strong> Standard digital bills/receipts provided for all completed rides."
        ]
    },

    doorstep: {
        heading: "Pickup & Drop at Your Location",
        icon: "fa-house-chimney",
        details: [
            "<strong>Zero Hassle:</strong> The car and driver arrive right at your residential doorstep, hotel, or office on time.",
            "<strong>Punctuality:</strong> Drivers reach the pickup point 10–15 minutes before the scheduled time.",
            "<strong>Flexible Drop:</strong> Drop back safely to your exact preferred location at the end of the trip."
        ]
    },

    fleet: {
        heading: "Sanitized & Neat Cars",
        icon: "fa-car-side",
        details: [
            "<strong>Regularly Serviced:</strong> All vehicles undergo routine mechanical check-ups before every outstation or long trip.",
            "<strong>Spotless Interior:</strong> Vacuum-cleaned interiors, fresh seat covers, and odor-free cabins.",
            "<strong>Comfortable Ride:</strong> Good AC performance and sufficient boot space for luggage.",
            "<strong>Reliable Vehicles:</strong> Well-maintained cars ready for a smooth and comfortable journey."
        ]
    },

    support: {
        heading: "Safe Journeys & Round-the-Clock Support",
        icon: "fa-headset",
        details: [
            "<strong>Live Assistance:</strong> Dedicated phone and WhatsApp support available throughout your trip duration.",
            "<strong>Trip Coordination:</strong> Direct communication support with the team and driver from start to finish.",
            "<strong>Emergency Backup:</strong> Immediate vehicle or driver replacement support in case of any rare breakdown.",
            "<strong>Safe for Families:</strong> Highly trusted by family travelers, senior citizens, and solo riders."
        ]
    }

};


function openWhyChooseModal(type) {

    const data = whyChooseData[type];

    if (!data) return;

    const modal = document.getElementById('why-choose-modal');
    const heading = document.getElementById('why-modal-heading');
    const iconBox = document.getElementById('why-modal-icon');
    const details = document.getElementById('why-modal-details');
    const whatsapp = document.getElementById('why-modal-whatsapp');

    if (!modal || !heading || !iconBox || !details) return;

    // Set heading
    heading.innerText = data.heading;

    // Set icon
    iconBox.innerHTML = `<i class="fa-solid ${data.icon}"></i>`;

    // Set bullet points
    details.innerHTML = data.details.map(item => `
        <li class="flex items-start gap-2.5">
            <span class="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                <i class="fa-solid fa-check text-[9px]"></i>
            </span>
            <span>${item}</span>
        </li>
    `).join('');

    // Dynamic WhatsApp message
    const message = `Hi Car with Driver Mobility LLP, I want to book a ride. I would like to know more about ${data.heading}.`;

    if (whatsapp) {
        whatsapp.href = `https://wa.me/919702988465?text=${encodeURIComponent(message)}`;
    }

    // Open modal
    modal.classList.remove('hidden');
    syncModalState(modal, true);
    modal.classList.add('flex');

    // Prevent background scrolling
    document.body.classList.add('overflow-hidden');
}


function closeWhyChooseModal() {

    const modal = document.getElementById('why-choose-modal');

    if (!modal) return;

    modal.classList.add('hidden');
    syncModalState(modal, false);
    modal.classList.remove('flex');

    // Scroll locking is synchronized with any other open modal.
}


function closeExistingModal(modal) {
    const close = {
        'fare-breakdown-modal': closeFareBreakdownModal,
        'booking-modal': closeModal,
        'sd-booking-modal': closeSDModal,
        'partner-modal': closePartnerModal,
        'success-confirmation-modal': closeSuccessModal,
        'sd-serviceability-modal': closeSDServiceabilityModal,
        'why-choose-modal': closeWhyChooseModal,
        'partner-upload-progress-modal': hidePartnerUploadProgress,
        'partner-error-modal': () => document.getElementById('partner-error-close').click()
    }[modal.id];
    if (close) close();
}

/* Reuse the existing backdrop listener; existing panels are the first child. */
document.addEventListener('click', function(event) {
    const modal = event.target.closest('[id$="-modal"].active');
    if (!modal) return;
    const content = modal.querySelector('.modal-content') || modal.firstElementChild;
    if (!content?.contains(event.target)) closeExistingModal(modal);
});

/* Close only the topmost visible modal using the existing Escape listener. */
document.addEventListener('keydown', function(event) {
    if (event.key !== 'Escape') return;
    const modals = [...document.querySelectorAll('[id$="-modal"].active')];
    modals.sort((a, b) => (parseInt(getComputedStyle(a).zIndex) || 0) - (parseInt(getComputedStyle(b).zIndex) || 0));
    const modal = modals.pop();
    if (modal) closeExistingModal(modal);
});
