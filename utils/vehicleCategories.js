// Vehicle assets are just regular assets (type = Equipment for the vehicle
// itself, type = Document for its insurance/registration/etc.) tagged with
// one of these categories. Shared so routes/dashboard.js, routes/vehicles.js,
// and jobs/dailyCheck.js all agree on exactly which categories count as
// "vehicle related".
const VEHICLE_CATEGORIES = ['Light Vehicle', 'Heavy Vehicle', 'Plant Equipment', 'Marine Vessel'];

module.exports = { VEHICLE_CATEGORIES };
