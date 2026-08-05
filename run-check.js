const { runDailyCheck } = require('./jobs/dailyCheck');

(async () => {
  try {
    await runDailyCheck();
    console.log('Daily check completed.');
    process.exit(0);
  } catch (error) {
    console.error('Daily check error:', error);
    process.exit(1);
  }
})();
