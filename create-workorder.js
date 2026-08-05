const fetch = global.fetch || require('node-fetch');

const [,, url, equipment_name, site_location, reason, estimated_duration, cookie] = process.argv;

if (!url || !equipment_name || !site_location) {
  console.error('Usage: node create-workorder.js <url> <equipment_name> <site_location> <reason> <estimated_duration> [cookie]');
  process.exit(1);
}

(async () => {
  try {
    const response = await fetch(`${url}/api/workorders/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({
        equipment_name,
        site_location,
        reason,
        estimated_duration: estimated_duration ? Number(estimated_duration) : null,
      }),
    });

    const json = await response.json();
    if (!response.ok) { 
      console.error('Create work order failed:', json);
      process.exit(1);
    }

    console.log('Created work order:', json);
  } catch (error) {
    console.error('Error creating work order:', error);
    process.exit(1);
  }
})();
