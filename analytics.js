fetch('api/get_history.php')
  .then(r => r.json())
  .then(data => {
    const sorted = (data.mostWatered || []).sort((a,b) => a.watering_frequency - b.watering_frequency);
    const labels = sorted.map(p => p.name);
    const values = sorted.map(p => p.watering_frequency ? (30 / p.watering_frequency) : 0);

    if (labels.length) {
      const ctx = document.getElementById('waterChart').getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Estimated waterings per month',
            data: values,
            backgroundColor: 'rgba(54, 162, 235, 0.5)'
          }]
        },
        options: {
          scales: { y: { beginAtZero: true } }
        }
      });
    }

    if (data.averages) {
      const avgWater = document.getElementById('avg-water');
      const avgFert = document.getElementById('avg-fert');
      if (avgWater) avgWater.textContent = Number(data.averages.watering).toFixed(1);
      if (avgFert) avgFert.textContent = Number(data.averages.fertilizing).toFixed(1);
    }
  })
  .catch(err => {
    console.error('Analytics load failed', err);
  });
