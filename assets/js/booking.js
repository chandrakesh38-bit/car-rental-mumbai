
        const SUPABASE_URL = "https://pwciaihqkfnlenxxiown.supabase.co";
        const SUPABASE_ANON_KEY = "sb_publishable_ZhQ7lv3YVC96tsNg_NoDuA_bxXHrbGz";
        const supabasePublic = (window.supabase && typeof window.supabase.createClient === 'function') ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let mumbaiPlaces = [];

        const destinationCities = [
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

const mumbaiMetroLocations = [
    { name: "Bhandup", km: 4, serviceable: true },
    { name: "Kanjur Marg", km: 4, serviceable: true },
    { name: "Nahur", km: 5, serviceable: true },
    { name: "Vidyavihar", km: 5, serviceable: true },
    { name: "Ghatkopar", km: 6, serviceable: true },
    { name: "Mulund", km: 7, serviceable: true },
    { name: "Kurla", km: 9, serviceable: true },
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

        // 6 WITH DRIVER CARS
        const wdFleet = [
            { name: 'Sedan (Dzire / Aura)', category: 'Comfort Sedan', seats: '4+1', bags: '2 Bags', rates: { local: { '8hr_80km': 3000, '10hr_100km': 3500, '12hr_120km': 4000, extraKm: 17 }, outstationPerKm: 17, driverAllowance: 500, airport: { t1: 1500, t2: 1600, nmia: 2000 } } },
            { name: 'Compact SUV (Punch / Brezza)', category: 'Compact SUV', seats: '4+1', bags: '2 Large Bags', rates: { local: { '8hr_80km': 3200, '10hr_100km': 3700, '12hr_120km': 4200, extraKm: 18 }, outstationPerKm: 18, driverAllowance: 500, airport: { t1: 1700, t2: 1800, nmia: 2200 } } },
            { name: 'Maruti Ertiga', category: 'Family MUV', seats: '6+1', bags: '3 Bags', rates: { local: { '8hr_80km': 3750, '10hr_100km': 4400, '12hr_120km': 5000, extraKm: 19 }, outstationPerKm: 19, driverAllowance: 500, airport: { t1: 2200, t2: 2400, nmia: 2800 } } },
            { name: 'Kia Carens', category: 'Premium Family MUV', seats: '6+1', bags: '3 Bags', rates: { local: { '8hr_80km': 4000, '10hr_100km': 4700, '12hr_120km': 5400, extraKm: 20 }, outstationPerKm: 20, driverAllowance: 500, airport: { t1: 2400, t2: 2600, nmia: 3000 } } },
            { name: 'Toyota Innova', category: 'Executive MUV', seats: '6+1', bags: '4 Bags', rates: { local: { '8hr_80km': 4400, '10hr_100km': 5200, '12hr_120km': 6000, extraKm: 22 }, outstationPerKm: 22, driverAllowance: 500, airport: { t1: 2700, t2: 2900, nmia: 3400 } } },
            { name: 'Innova Crysta', category: 'Luxury MUV', seats: '6+1', bags: '4 Bags', rates: { local: { '8hr_80km': 5000, '10hr_100km': 6000, '12hr_120km': 7000, extraKm: 25 }, outstationPerKm: 25, driverAllowance: 500, airport: { t1: 3000, t2: 3200, nmia: 3800 } } }
        ];

        // COMPLETE 32 EXCEL CARS FOR SELF DRIVE
        let excelCarsData = [
            { "brand": "Tata", "model": "Nexon", "fullName": "Tata Nexon", "segment": "Compact SUV", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹117/hour", "rateVal": 117, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1Or6F03FkxBCjzM3MC9l7A4X6EbtTueZ5", "priority": 1, "bestSelling": true },
            { "brand": "Tata", "model": "Punch", "fullName": "Tata Punch", "segment": "Compact SUV", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹113/hour", "rateVal": 113, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1UeNkkagK6T0LUjt2ncB6HZaW_K5iFgE5", "priority": 2, "bestSelling": true },
            { "brand": "Maruti Suzuki", "model": "Swift", "fullName": "Maruti Suzuki Swift", "segment": "Hatchback", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹104/hour", "rateVal": 104, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1kdLktKSk6yMlPJDY5BVdeNyC70rfM6eZ", "priority": 3, "bestSelling": true },
            { "brand": "Maruti Suzuki", "model": "Baleno", "fullName": "Maruti Suzuki Baleno", "segment": "Hatchback", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹104/hour", "rateVal": 104, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1KClMWsI-DX43nzhueP5Mjy-txH04VxaY", "priority": 4, "bestSelling": false },
            { "brand": "Maruti Suzuki", "model": "Brezza", "fullName": "Maruti Suzuki Brezza", "segment": "Compact SUV", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹146/hour", "rateVal": 146, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1ZQThm_H_eCLv4kBFYixmyjlBFLimsqw5", "priority": 5, "bestSelling": false },
            { "brand": "Maruti Suzuki", "model": "Dzire", "fullName": "Maruti Suzuki Dzire", "segment": "Sedan", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹113/hour", "rateVal": 113, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/18pheBt3K7gbOXwSutbdNVWrok_N2DCG3", "priority": 6, "bestSelling": true },
            { "brand": "Maruti Suzuki", "model": "Ertiga", "fullName": "Maruti Suzuki Ertiga", "segment": "MUV / 7-Seater", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 7, "rateHour": "₹138/hour", "rateVal": 138, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/15o35vVV6iXixrjwMIXiIhLxAFeHj5Uel", "priority": 7, "bestSelling": true },
            { "brand": "Hyundai", "model": "Creta", "fullName": "Hyundai Creta", "segment": "SUV", "transmission": "Manual", "fuel": "Diesel", "seats": 5, "rateHour": "₹167/hour", "rateVal": 167, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1In3muCV_Mk72zELKjAIlhs-OWgR7RKof", "priority": 8, "bestSelling": true },
            { "brand": "Mahindra", "model": "Thar", "fullName": "Mahindra Thar", "segment": "SUV", "transmission": "Manual", "fuel": "Diesel", "seats": 4, "rateHour": "₹229/hour", "rateVal": 229, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1bC337oF5wf0Dl2KdkdRgagkeOP_VFqI5", "priority": 9, "bestSelling": true },
            { "brand": "Mahindra", "model": "Scorpio N", "fullName": "Mahindra Scorpio N", "segment": "MUV / 7-Seater", "transmission": "Manual", "fuel": "Diesel", "seats": 7, "rateHour": "₹229/hour", "rateVal": 229, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1wKIdSZZ3mykmzIZSpKGXRl_zFkWQNcuq", "priority": 10, "bestSelling": true },
            { "brand": "Toyota", "model": "Innova Crysta", "fullName": "Toyota Innova Crysta", "segment": "MUV / 7-Seater", "transmission": "Manual", "fuel": "Diesel", "seats": 7, "rateHour": "₹229/hour", "rateVal": 229, "deposit": "₹4,000", "depositVal": 4000, "imgUrl": "https://lh3.googleusercontent.com/d/1sK2Fjmg7xKcltpCAS_SIV4MbXLLd90fl", "priority": 11, "bestSelling": true },
            { "brand": "Mahindra", "model": "Thar Roxx", "fullName": "Mahindra Thar Roxx", "segment": "SUV", "transmission": "Automatic", "fuel": "Diesel", "seats": 4, "rateHour": "₹333/hour", "rateVal": 333, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/14UgKtx1oqWl84guztZ28c3Kgmo_6jP-C", "priority": 12, "bestSelling": false },
            { "brand": "Mahindra", "model": "7XO", "fullName": "Mahindra 7XO", "segment": "MUV / 7-Seater", "transmission": "Automatic", "fuel": "Diesel", "seats": 7, "rateHour": "₹375/hour", "rateVal": 375, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/164EyWUGQ24XIZPit5_rVZ7kTbmNU1Pim", "priority": 13, "bestSelling": false },
            { "brand": "Mahindra", "model": "XUV 700", "fullName": "Mahindra XUV 700", "segment": "MUV / 7-Seater", "transmission": "Manual", "fuel": "Diesel", "seats": 7, "rateHour": "₹313/hour", "rateVal": 313, "deposit": "₹4,000", "depositVal": 4000, "imgUrl": "https://lh3.googleusercontent.com/d/1JZrrF7FqV8DUrTfV-_fXCpzOEa7Zii33", "priority": 14, "bestSelling": false },
            { "brand": "BMW", "model": "520D", "fullName": "BMW 520D", "segment": "Luxury Sedan", "transmission": "Automatic", "fuel": "Diesel", "seats": 5, "rateHour": "₹650/hour", "rateVal": 650, "deposit": "₹10,000", "depositVal": 10000, "imgUrl": "https://lh3.googleusercontent.com/d/1Mjy4A4BhkWhIgHz1E9Ofy6aCUk53IZkP", "priority": 15, "bestSelling": false },
            { "brand": "Jeep", "model": "Compass", "fullName": "Jeep Compass", "segment": "SUV", "transmission": "Manual", "fuel": "Diesel", "seats": 5, "rateHour": "₹229/hour", "rateVal": 229, "deposit": "₹5,000", "depositVal": 5000, "imgUrl": "https://lh3.googleusercontent.com/d/1baBIvOkCMRSM9KUTn6AvTWPPBBC5kxa9", "priority": 16, "bestSelling": false },
            { "brand": "Kia", "model": "Carens", "fullName": "Kia Carens", "segment": "MUV / 7-Seater", "transmission": "Manual", "fuel": "Diesel", "seats": 6, "rateHour": "₹188/hour", "rateVal": 188, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1LKPHrDzRtHODi2kiWgAC-DCFhneNBxfd", "priority": 17, "bestSelling": false },
            { "brand": "Hyundai", "model": "Exter (Automatic)", "fullName": "Hyundai Exter (Automatic)", "segment": "Compact SUV", "transmission": "Automatic", "fuel": "Petrol", "seats": 5, "rateHour": "₹125/hour", "rateVal": 125, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1Xr2sz7JNItXbig-ARJOnlYDHQg7GF1sv", "priority": 18, "bestSelling": false },
            { "brand": "Hyundai", "model": "Exter (Manual)", "fullName": "Hyundai Exter (Manual)", "segment": "Compact SUV", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹113/hour", "rateVal": 113, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1Xr2sz7JNItXbig-ARJOnlYDHQg7GF1sv", "priority": 19, "bestSelling": false },
            { "brand": "Hyundai", "model": "i20", "fullName": "Hyundai i20", "segment": "Hatchback", "transmission": "Manual", "fuel": "Petrol", "seats": 5, "rateHour": "₹113/hour", "rateVal": 113, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1ZDZwcXPDBFiUCMNzwWQfDaeHZuiW2Vha", "priority": 20, "bestSelling": false },
            { "brand": "Tata", "model": "Altroz", "fullName": "Tata Altroz", "segment": "Hatchback", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹104/hour", "rateVal": 104, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1mvxm-Z64rgxrriXE4q3pU9oSq1F1vvdk", "priority": 21, "bestSelling": false },
            { "brand": "Tata", "model": "Safari", "fullName": "Tata Safari", "segment": "MUV / 7-Seater", "transmission": "Automatic", "fuel": "Diesel", "seats": 6, "rateHour": "₹375/hour", "rateVal": 375, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1cE2ZSnX39ApvlXQOJWnARn54_ma5TQSA", "priority": 22, "bestSelling": false },
            { "brand": "Toyota", "model": "Glanza", "fullName": "Toyota Glanza", "segment": "Hatchback", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹108/hour", "rateVal": 108, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1kb38eCjAtEm4hv6-YR9voZaHJLtu7YbI", "priority": 23, "bestSelling": false },
            { "brand": "Toyota", "model": "Rumion", "fullName": "Toyota Rumion", "segment": "MUV / 7-Seater", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 7, "rateHour": "₹138/hour", "rateVal": 138, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1IaOGRC0_ijk7Ud5FDv4PK2tk6IFQ8HHu", "priority": 24, "bestSelling": false },
            { "brand": "Toyota", "model": "Urban Cruiser Taisor", "fullName": "Toyota Urban Cruiser Taisor", "segment": "Compact SUV", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹104/hour", "rateVal": 104, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/12KEugN2uW4Z5_AyEg_8ns3Rn2LHVOv8M", "priority": 25, "bestSelling": false },
            { "brand": "Maruti Suzuki", "model": "Fronx (Automatic)", "fullName": "Maruti Suzuki Fronx (Automatic)", "segment": "Compact SUV", "transmission": "Automatic", "fuel": "Petrol", "seats": 5, "rateHour": "₹108/hour", "rateVal": 108, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1veZedIFNHABbzOVVy1eBNqgceXjn1wqJ", "priority": 26, "bestSelling": false },
            { "brand": "Maruti Suzuki", "model": "Fronx (Manual)", "fullName": "Maruti Suzuki Fronx (Manual)", "segment": "Compact SUV", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹104/hour", "rateVal": 104, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1veZedIFNHABbzOVVy1eBNqgceXjn1wqJ", "priority": 27, "bestSelling": false },
            { "brand": "Maruti Suzuki", "model": "Grand Vitara", "fullName": "Maruti Suzuki Grand Vitara", "segment": "SUV", "transmission": "Manual", "fuel": "Diesel", "seats": 5, "rateHour": "₹167/hour", "rateVal": 167, "deposit": "₹4,000", "depositVal": 4000, "imgUrl": "https://lh3.googleusercontent.com/d/1PpB-DhjK0H71vEG0-RQk31IYia6wE0h8", "priority": 28, "bestSelling": false },
            { "brand": "Maruti Suzuki", "model": "Ignis", "fullName": "Maruti Suzuki Ignis", "segment": "Hatchback", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹104/hour", "rateVal": 104, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1QIuOiX3yAdwEF6VEKGJblzi-ZI-WinKC", "priority": 29, "bestSelling": false },
            { "brand": "Maruti Suzuki", "model": "WagonR", "fullName": "Maruti Suzuki WagonR", "segment": "Hatchback", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 5, "rateHour": "₹96/hour", "rateVal": 96, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1kz6JIn_-R6A--3K7tj569gV6Vpku3SQF", "priority": 30, "bestSelling": false },
            { "brand": "Maruti Suzuki", "model": "XL6", "fullName": "Maruti Suzuki XL6", "segment": "MUV / 7-Seater", "transmission": "Manual", "fuel": "Petrol + CNG", "seats": 6, "rateHour": "₹146/hour", "rateVal": 146, "deposit": "₹3,000", "depositVal": 3000, "imgUrl": "https://lh3.googleusercontent.com/d/1LU-uNsvgWo6RXN3Xq7y8c4PTMSgLs930", "priority": 31, "bestSelling": false },
            { "brand": "Mahindra", "model": "Mahindra XUV 500", "fullName": "Mahindra XUV 500", "segment": "MUV / 7-Seater", "transmission": "Manual", "fuel": "Diesel", "seats": 7, "rateHour": "₹188/hour", "rateVal": 188, "deposit": "₹4,000", "depositVal": 4000, "imgUrl": "https://lh3.googleusercontent.com/d/14nWzEeYcUlawsmTNanoS7Fw6QsAWOW98", "priority": 32, "bestSelling": false }
        ];

        let currentMainMode = 'withdriver';
        let currentWDSubTab = 'outstation';
        let currentAirportType = 'drop';
        let wdOutstationKm = 300;
        let wdOutstationDays = 1;
        let chosenCarName = '';
        let chosenFareAmount = 0;
        let selectedCarObj = null;
        let currentDeliveryMode = 'home';
        let calculatedRentalHours = 24;
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

        <button type="button"
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
                if (pDate && pDate.value && rDate) rDate.value = pDate.value;
            } else if (tab === 'airport') {
                setAirportTransferType('drop');
            }
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

        function setAirportTransferType(type) {
            currentAirportType = type;
            const btnDrop = document.getElementById('btn-airport-drop');
            const btnPickup = document.getElementById('btn-airport-pickup');
            const formBox = document.getElementById('airport-dynamic-form');

            const dateTimeHTML = `
                <div class="mt-4 pt-4 border-t border-slate-200">
                    <label class="block text-xs font-bold text-slate-700 uppercase mb-1.5"><i class="fa-solid fa-calendar-day text-indigo-600 mr-1"></i> Pickup Date & Time *</label>
                    <div class="grid grid-cols-3 gap-1.5">
                        <div class="relative">
    <input type="date" id="wd-airport-date" onclick="this.showPicker()" class="date-input-custom w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-2 text-xs font-medium outline-none cursor-pointer">
    <span id="wd-airport-date-placeholder" class="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">
        DD/MM/YY
    </span>
</div>
                        <select id="wd-airport-hour" class="bg-slate-50 border border-slate-300 rounded-lg px-1.5 py-2 text-xs font-medium outline-none">
                            <option value="1">01:00</option><option value="2">02:00</option><option value="3">03:00</option><option value="4">04:00</option>
                            <option value="5">05:00</option><option value="6">06:00</option><option value="7">07:00</option><option value="8">08:00</option>
                            <option value="9" selected>09:00</option><option value="10">10:00</option><option value="11">11:00</option><option value="12">12:00</option>
                        </select>
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
                        <div class="relative">
                            <label class="block text-xs font-bold text-slate-700 uppercase mb-1.5"><i class="fa-solid fa-location-dot text-indigo-600 mr-1"></i> Pickup Area / Address *</label>
                            <input type="text" id="wd-airport-pickup" autocomplete="off" oninput="showSuggestions('wd-airport-pickup', 'mumbai-places', 'wd-airport-dropdown')" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none font-medium" placeholder="Enter pickup area">
                            <div id="wd-airport-dropdown" class="autocomplete-dropdown hidden"></div>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 uppercase mb-1.5"><i class="fa-solid fa-plane text-indigo-600 mr-1"></i> Airport / Terminal *</label>
                            <select id="wd-airport-terminal" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none font-medium" onchange="calculateDriverFare()">
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
                            <label class="block text-xs font-bold text-slate-700 uppercase mb-1.5"><i class="fa-solid fa-plane text-indigo-600 mr-1"></i> Airport / Terminal *</label>
                            <select id="wd-airport-terminal" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none font-medium" onchange="calculateDriverFare()">
                                <option value="t2" selected>Mumbai Airport T2 (International / Domestic)</option>
                                <option value="t1">Mumbai Airport T1 (Santacruz Domestic)</option>
                                <option value="nmia">Navi Mumbai International Airport (NMIA)</option>
                            </select>
                        </div>
                        <div class="relative">
                            <label class="block text-xs font-bold text-slate-700 uppercase mb-1.5"><i class="fa-solid fa-location-dot text-indigo-600 mr-1"></i> Drop Area / Address *</label>
                            <input type="text" id="wd-airport-pickup" autocomplete="off" oninput="showSuggestions('wd-airport-pickup', 'mumbai-places', 'wd-airport-dropdown')" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm outline-none font-medium" placeholder="Enter drop area">
                            <div id="wd-airport-dropdown" class="autocomplete-dropdown hidden"></div>
                        </div>
                    </div>
                    ${dateTimeHTML}
                `;
            }

          setTimeout(() => {
        updateDatePlaceholder('wd-airport-date', 'wd-airport-date-placeholder');
    }, 50);      
                
        }

        function onPickupDateChange() {
            const pDate = document.getElementById('wd-out-pdate').value;
            const rDate = document.getElementById('wd-out-rdate');
            if (pDate && rDate) rDate.value = pDate;
            calculateDriverFare();
        }

        function selectQuickRoute(destName) {
            setServiceMode('withdriver');
            setWDSubTab('outstation');
            const destInput = document.getElementById('wd-out-destination');
            if (destInput) destInput.value = destName;
            onWDDestinationInput();
            document.getElementById('booking-widget').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function showSuggestions(inputId, datasetType, dropdownId) {
            const input = document.getElementById(inputId);
            const dropdown = document.getElementById(dropdownId);
            const query = input.value.trim().toLowerCase();
            if (!query) { dropdown.innerHTML = ''; dropdown.classList.add('hidden'); return; }

            let matches = [];
            if (datasetType === 'mumbai-places') matches = mumbaiPlaces.filter(p => p.toLowerCase().includes(query));
            else if (datasetType === 'maharashtra-destinations') matches = destinationCities.filter(c => c.name.toLowerCase().includes(query)).map(c => c.name);
            else if (datasetType === 'mumbai-metro-locations') matches = mumbaiMetroLocations.filter(l => l.name.toLowerCase().includes(query)).map(l => l.name);

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

        function onWDDestinationInput() {
            const inputVal = document.getElementById('wd-out-destination').value.trim().toLowerCase();
            let foundKm = null;
            for (let c of destinationCities) {
                if (c.name.toLowerCase() === inputVal) { foundKm = c.km; break; }
            }
            wdOutstationKm = foundKm ? foundKm : 300;
            document.getElementById('wd-metric-km').innerText = wdOutstationKm;
            calculateDriverFare();
        }

        function calculateDriverFare() {
            if (currentMainMode === 'withdriver' && currentWDSubTab === 'outstation') {
                const pDate = document.getElementById('wd-out-pdate').value;
                const rDate = document.getElementById('wd-out-rdate').value;
                if (pDate && rDate) {
                    const pDT = new Date(pDate);
                    const rDT = new Date(rDate);
                    const diffDays = Math.max(1, Math.ceil((rDT - pDT) / (1000 * 60 * 60 * 24)) + 1);
                    wdOutstationDays = diffDays;
                    document.getElementById('wd-metric-days').innerText = wdOutstationDays;
                    document.getElementById('wd-metric-billable-km').innerText = Math.max(wdOutstationKm, wdOutstationDays * 300);
                }
            }
            renderWDFleet();
        }

        function getCarCost(car) {
            if (currentWDSubTab === 'local') {
                const pkg = document.getElementById('wd-local-package').value;
                return car.rates.local[pkg] || 3000;
            } else if (currentWDSubTab === 'outstation') {
                const billableKm = Math.max(wdOutstationKm, wdOutstationDays * 300);
                return (billableKm * car.rates.outstationPerKm) + (wdOutstationDays * car.rates.driverAllowance);
            } else if (currentWDSubTab === 'airport') {
                const termInput = document.getElementById('wd-airport-terminal');
                const term = termInput ? termInput.value : 't2';
                return car.rates.airport[term] || car.rates.airport.t2;
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
                    const billableKm = Math.max(wdOutstationKm, wdOutstationDays * 300);
                    kmIncludedText = `${billableKm} KM included`;
                    hrsIncludedText = `${wdOutstationDays * 24} Hours (${wdOutstationDays} Day) included`;
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
                                <span class="text-[10px] text-slate-400 block font-semibold uppercase">Total Est.</span>
                                <span class="text-xl font-black text-indigo-950">₹${fare.toLocaleString('en-IN')}</span>
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
                    </div>
                    <button type="button" onclick="handleBookThisCarClick('${car.name}', ${fare})" class="w-full bg-indigo-950 hover:bg-indigo-900 text-white font-bold py-2.5 rounded-xl transition text-xs tracking-wide shadow-sm">
                        Book This Car
                    </button>
                `;
                container.appendChild(card);
            });
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

            } else if (currentWDSubTab === 'airport') {
                const airportPickupInput = document.getElementById('wd-airport-pickup');
                const airportDateInput = document.getElementById('wd-airport-date');

                if (!airportPickupInput || !airportPickupInput.value.trim()) { 
                    if(airportPickupInput) airportPickupInput.classList.add('border-red-500'); 
                    firstMissingField = airportPickupInput; 
                    missing = true; 
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
            return true;
        }

        function handleBookThisCarClick(carName, fare) {
            if (!validateJourneyAndOpenBooking(carName, fare)) return;
            openModal(carName, fare);
        }

        function triggerFareSearch() {
            if (currentMainMode === 'withdriver' && !validateJourneyAndOpenBooking()) return;
            calculateDriverFare();
            document.getElementById('fleet').scrollIntoView({ behavior: 'smooth' });
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
            return true;
        }

        function triggerSDParseSearch() {
            if (!validateSelfDriveJourney()) return;
            applyAllSDFilters();
            document.getElementById('selfdrive-cars-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                            <img src="${car.imgUrl}" alt="${car.fullName}" class="w-full h-full object-cover">
                            <span class="absolute top-3 left-3 text-[10px] font-bold bg-indigo-950/80 text-amber-300 px-2 py-0.5 rounded">${car.brand}</span>
                        </div>
                        <div class="p-4">
                            <h3 class="font-bold text-slate-900 text-base">${car.fullName}</h3>
                            <span class="text-lg font-black text-indigo-950 mt-1 block">${car.rateHour}</span>
                        </div>
                    </div>
                    <div class="p-4 pt-0">
                        <button type="button" onclick="handleBookSelfDriveClick(${JSON.stringify(car).replace(/"/g, '&quot;')})" class="w-full bg-indigo-950 hover:bg-indigo-900 text-white font-bold py-2.5 rounded-xl transition text-xs flex items-center justify-center gap-2">
                            <i class="fa-solid fa-key text-amber-400"></i> Book Self Drive
                        </button>
                    </div>
                `;
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

        function openFareBreakdownModal() {
            const contentBox = document.getElementById('fare-breakdown-content');
            if (!contentBox) return;
            contentBox.innerHTML = `
                <p class="font-bold text-slate-900">Transparent Fare & Inclusions Details:</p>
                <ul class="list-disc pl-4 space-y-1.5 pt-1">
                    <li><strong>Fuel & Driver:</strong> Fully included.</li>
                    <li><strong>Tolls & Parking:</strong> Extra as per actual receipts.</li>
                </ul>
            `;
            document.getElementById('fare-breakdown-modal').classList.remove('hidden');
        }
        function closeFareBreakdownModal() { document.getElementById('fare-breakdown-modal').classList.add('hidden'); }

        function openModal(name, fare) {
            chosenCarName = name;
            chosenFareAmount = fare;
            document.getElementById('modal-car-name').innerText = name;
            document.getElementById('modal-fare').innerText = '₹' + fare.toLocaleString('en-IN');
            
            let pickupLoc = '';
            let destLoc = '';
            let dateTimeStr = '';
            let pkgStr = '';

            if (currentWDSubTab === 'local') {
                pickupLoc = document.getElementById('wd-local-pickup').value || 'Mumbai';
                destLoc = 'Local City Package';
                dateTimeStr = (document.getElementById('wd-local-date').value || 'Today') + ' @ ' + document.getElementById('wd-local-hour').value + ':00 ' + document.getElementById('wd-local-ampm').value;
                pkgStr = document.getElementById('wd-local-package').value;
            } else if (currentWDSubTab === 'outstation') {
                pickupLoc = document.getElementById('wd-out-pickup').value || 'Mumbai';
                destLoc = document.getElementById('wd-out-destination').value || 'Maharashtra';
                dateTimeStr = (document.getElementById('wd-out-pdate').value || 'Today') + ' (' + document.getElementById('wd-out-phour').value + ':00 ' + document.getElementById('wd-out-pampm').value + ')';
                pkgStr = `Outstation (${wdOutstationKm} KM, ${wdOutstationDays} Days)`;
            } else if (currentWDSubTab === 'airport') {
                pickupLoc = document.getElementById('wd-airport-pickup').value || 'Mumbai Address';
                destLoc = document.getElementById('wd-airport-terminal').value.toUpperCase() + ' Airport';
                dateTimeStr = (document.getElementById('wd-airport-date').value || 'Today') + ' @ ' + document.getElementById('wd-airport-hour').value + ':00 ' + document.getElementById('wd-airport-ampm').value;
                pkgStr = 'Airport Transfer';
            }

            document.getElementById('modal-summary-pickup').innerText = pickupLoc;
            document.getElementById('modal-summary-dest').innerText = destLoc;
            document.getElementById('modal-summary-datetime').innerText = dateTimeStr;
            document.getElementById('modal-summary-package').innerText = pkgStr;

            document.getElementById('booking-modal').classList.remove('hidden');
        }
        function closeModal() { document.getElementById('booking-modal').classList.add('hidden'); }

        function openSDModal(car) {
            selectedCarObj = car;
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
            document.getElementById('sd-review-duration').innerText = `${calculatedRentalHours} Hours`;

            updateSDFareReview();
            document.getElementById('sd-booking-modal').classList.remove('hidden');
        }
        function closeSDModal() { document.getElementById('sd-booking-modal').classList.add('hidden'); }

        function openPartnerModal() { document.getElementById('partner-modal').classList.remove('hidden'); }
        function closePartnerModal() { document.getElementById('partner-modal').classList.add('hidden'); }

        window.showSuccessModal = function(applicationNumber) {
    const modal = document.getElementById('success-confirmation-modal');
    const idBox = document.getElementById('success-application-id');
    const idText = document.getElementById('success-application-number');

    if (applicationNumber) {
        idText.textContent = applicationNumber;
        idBox.classList.remove('hidden');
    } else {
        idBox.classList.add('hidden');
    }

    modal.classList.remove('hidden');
};
        
        function closeSuccessModal() { document.getElementById('success-confirmation-modal').classList.add('hidden'); }

        function onSDDeliveryOptionChange() {
            currentDeliveryMode = document.querySelector('input[name="sd-delivery-mode"]:checked').value;
            const homeBox = document.getElementById('sd-home-delivery-box');
            if (currentDeliveryMode === 'home') homeBox.classList.remove('hidden');
            else homeBox.classList.add('hidden');
            updateSDFareReview();
        }

        function updateSDFareReview() {
            if (!selectedCarObj) return;
            const baseFare = calculatedRentalHours * selectedCarObj.rateVal;
            const deposit = selectedCarObj.depositVal;
            
            let deliveryCharge = 500;
            if (currentDeliveryMode === 'home') {
                const locInput = document.getElementById('sd-delivery-location-input').value.trim().toLowerCase();
                const found = mumbaiMetroLocations.find(l => l.name.toLowerCase() === locInput);
                let oneWayKm = found ? found.km : 10;
                let totalDeliveryKm = oneWayKm * 2;
                if (totalDeliveryKm <= 20) {
                    deliveryCharge = 500;
                } else {
                    deliveryCharge = totalDeliveryKm * 25;
                }
                document.getElementById('sd-review-delivery-charge-row').style.display = 'flex';
                document.getElementById('sd-review-delivery-charge').innerText = `₹${deliveryCharge.toLocaleString('en-IN')}`;
                document.getElementById('sd-review-deliv-mode').innerText = 'Home Delivery';
                document.getElementById('sd-review-deliv-location-row').style.display = 'block';
                document.getElementById('sd-review-deliv-location').innerText = document.getElementById('sd-delivery-location-input').value || 'Mumbai Hub Delivery';
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
        }

function onDeliveryLocationSelect() {
    const input = document.getElementById('sd-delivery-location-input');
    const locInput = input.value.trim().toLowerCase();

    const found = mumbaiMetroLocations.find(
        l => l.name.toLowerCase() === locInput
    );

    if (!found) return;

    // Not serviceable location
    if (found.serviceable === false) {
        input.value = '';

        document.getElementById('sd-cust-city').value = '';
        document.getElementById('sd-cust-state').value = '';

        document.getElementById('sd-serviceability-modal').classList.remove('hidden');
        document.getElementById('sd-serviceability-modal').classList.add('flex');

        updateSDFareReview();
        return;
    }

    // Serviceable location
    document.getElementById('sd-cust-city').value = found.city || '';
    document.getElementById('sd-cust-state').value = found.state || '';

    updateSDFareReview();
}

function closeSDServiceabilityModal() {
    const modal = document.getElementById('sd-serviceability-modal');
    modal.classList.add('hidden');
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

function handleBookingSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('cust-name').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const email = document.getElementById('cust-email').value.trim();
    const address = document.getElementById('cust-address').value.trim();

    const car = wdFleet.find(c => c.name === chosenCarName);

    let message = '';
    let subject = '';

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

        const bookingId = generateBookingId();

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
    }

    // =========================
    // OUTSTATION
    // =========================
    else if (currentWDSubTab === 'outstation') {

        const pickupLocation = document.getElementById('wd-out-pickup').value.trim();
        const destination = document.getElementById('wd-out-destination').value.trim();

        const pickupDate = document.getElementById('wd-out-pdate').value;
        const pickupHour = parseInt(document.getElementById('wd-out-phour').value);
        const pickupAmPm = document.getElementById('wd-out-pampm').value;

        const returnDate = document.getElementById('wd-out-rdate').value;
        const returnHour = parseInt(document.getElementById('wd-out-rhour').value);
        const returnAmPm = document.getElementById('wd-out-rampm').value;

        const extraKmRate = car?.rates?.outstationPerKm || 0;
        const driverAllowance = car?.rates?.driverAllowance || 0;

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

        const billableKm = Math.max(
            wdOutstationKm,
            wdOutstationDays * 300
        );

        const bookingId = generateBookingId();

        message = `
🚨 OUTSTATION | ${bookingId}

👤 ${name} | ${phone}
🚗 ${chosenCarName} | ₹${chosenFareAmount.toLocaleString('en-IN')}
📍 ${pickupLocation} → ${destination}
📅 Start: ${formatBookingDateTime(startDateTime)}
📅 Return: ${formatBookingDateTime(returnDateTime)}
⏱ ${wdOutstationDays} Day${wdOutstationDays > 1 ? 's' : ''} | ${billableKm} KM
💰 ₹${extraKmRate}/KM | Driver ₹${driverAllowance}/Day

✓ Incl: Fuel, Driver
✕ Excl: Toll, Parking, State Tax
`;

        subject = `New booking assigned to your car – ${chosenCarName}`;
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

        const bookingId = generateBookingId();

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
📅 ${formatBookingDateTime(journeyDateTime)}

✓ Incl: Fuel, Driver
✕ Excl: Toll, Parking
`;
        }

        subject = `New booking assigned to your car – ${chosenCarName}`;
    }

    sendWithDriverBookingEmail(
        subject,
        name,
        phone,
        email,
        message
    );

    closeModal();
    showSuccessModal();
}
        function handleSDBookingSubmit(e) {
            e.preventDefault();
            const name = document.getElementById('sd-cust-name').value;
            const phone = document.getElementById('sd-cust-phone').value;
            const email = document.getElementById('sd-cust-email').value;
            const totalText = document.getElementById('disp-total-final-fare').innerText;
            sendEmailNotification('Self-Drive Booking', name, phone, email, `Car: ${selectedCarObj.fullName}, Total Fare: ${totalText}`);
            closeSDModal();
            showSuccessModal();
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
        modal.classList.remove('flex');
    }
}

function showPartnerErrorModal(message) {

    hidePartnerUploadProgress();

    let modal = document.getElementById('partner-error-modal');

    if (modal) modal.remove();

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
 
    // Close button click (ab yeh 100% kaam karega aur popup band kar dega)
    document.getElementById('partner-error-close').onclick = function () {
        modal.remove();
    };
        
    document.getElementById('partner-reupload-btn').onclick = function () {
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
        modal.remove();
    };
}


async function handlePartnerFormSubmit(e) {

    e.preventDefault();

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

    if (!window.preparePartnerFiles()) {

        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;

        return;
    }

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

showSuccessModal(result.application_number);

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

        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
    }
}
        
        function sendWithDriverBookingEmail(subject, name, phone, email, message) {
    try {
        fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                access_key: '7fc1c790-ab07-4fef-96ec-df301fa0c4ae',
                subject: subject,
                from_name: 'CWD Dispatch Bot',
                email: email,
                message: message
            })
        })
        .then(response => response.json())
        .then(result => {
            if (!result.success) {
                console.error('Web3Forms booking email error:', result);
            }
        })
        .catch(err => {
            console.error('Booking email error:', err);
        });
    } catch (err) {
        console.error('Booking email error:', err);
    }
}

        function sendEmailNotification(title, name, phone, email, details) {
            try {
                fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({
                        access_key: '7fc1c790-ab07-4fef-96ec-df301fa0c4ae',
                        subject: `New ${title} from ${name}`,
                        from_name: 'CWD Dispatch Bot',
                        email: email,
                        message: `Name: ${name}\nPhone: ${phone}\nEmail: ${email}\nDetails: ${details}`
                    })
                });
            } catch(err) { console.error('Email error', err); }
        }

        window.onload = function() {
            setWDSubTab('outstation');
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

function updateDatePlaceholder(inputId, placeholderId) {
    const input = document.getElementById(inputId);
    const placeholder = document.getElementById(placeholderId);

    if (!input || !placeholder) return;

    function update() {
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

    input.addEventListener('change', update);
    input.addEventListener('input', update);
}

document.addEventListener('DOMContentLoaded', function () {
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
    const message = `Hi Car with Driver India, I want to book a ride. I would like to know more about ${data.heading}.`;

    if (whatsapp) {
        whatsapp.href = `https://wa.me/919702988465?text=${encodeURIComponent(message)}`;
    }

    // Open modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Prevent background scrolling
    document.body.classList.add('overflow-hidden');
}


function closeWhyChooseModal() {

    const modal = document.getElementById('why-choose-modal');

    if (!modal) return;

    modal.classList.add('hidden');
    modal.classList.remove('flex');

    // Restore background scrolling
    document.body.classList.remove('overflow-hidden');
}


/* Close when clicking outside the popup */
document.addEventListener('click', function(event) {

    const modal = document.getElementById('why-choose-modal');

    if (!modal) return;

    if (event.target === modal) {
        closeWhyChooseModal();
    }

});


/* Close popup with ESC key */
document.addEventListener('keydown', function(event) {

    if (event.key === 'Escape') {
        closeWhyChooseModal();
    }

});

