document.addEventListener('DOMContentLoaded', () => {
    const predictButton = document.getElementById('predictButton');
    const downloadButton = document.getElementById('downloadButton');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const chartDiv = document.getElementById('chart');
    const statsDiv = document.getElementById('stats');
    const radarDiv = document.getElementById('radarChart'); // Ensure this exists in the DOM

    function showError(message) {
        console.error(message);
        statsDiv.innerHTML = `<p style="color: red;">${message}</p>`;
    }

    predictButton.addEventListener('click', async () => {
        loadingSpinner.style.display = 'block';
        statsDiv.innerHTML = '';
        chartDiv.innerHTML = '';
        radarDiv.innerHTML = ''; // Clear radar chart content

        try {
            const response = await fetch('http://127.0.0.1:5020/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} - ${response.statusText}`);
            }

            const predictions = await response.json();

            if (!Array.isArray(predictions) || predictions.length === 0) {
                throw new Error('Invalid or empty response from API.');
            }

            const timestamps = predictions.map((p) => new Date(p.Timestamp));
            const values = predictions.map((p) => p.Prediction);

            // Group data by time range (e.g., morning, afternoon, evening)
            const timeRanges = {
                Morning: [],
                Afternoon: [],
                Evening: [],
                Night: []
            };

            timestamps.forEach((timestamp, index) => {
                const hour = timestamp.getHours();
                if (hour >= 6 && hour < 12) {
                    timeRanges.Morning.push(values[index]);
                } else if (hour >= 12 && hour < 18) {
                    timeRanges.Afternoon.push(values[index]);
                } else if (hour >= 18 && hour < 24) {
                    timeRanges.Evening.push(values[index]);
                } else {
                    timeRanges.Night.push(values[index]);
                }
            });

            const radarData = {
                Morning: timeRanges.Morning.reduce((a, b) => a + b, 0) / (timeRanges.Morning.length || 1),
                Afternoon: timeRanges.Afternoon.reduce((a, b) => a + b, 0) / (timeRanges.Afternoon.length || 1),
                Evening: timeRanges.Evening.reduce((a, b) => a + b, 0) / (timeRanges.Evening.length || 1),
                Night: timeRanges.Night.reduce((a, b) => a + b, 0) / (timeRanges.Night.length || 1),
            };

            // Plot radar chart
           // Plot radar chart
            Plotly.newPlot(radarDiv, [{
                type: 'scatterpolar',
                r: [
                    radarData.Morning * 100,
                    radarData.Afternoon * 100,
                    radarData.Evening * 100,
                    radarData.Night * 100,
                    radarData.Morning * 100 // Close the loop
                ],
                theta: ['Morning', 'Afternoon', 'Evening', 'Night', 'Morning'],
                fill: 'toself',
                name: 'Occupancy (%)',
                line: { color: '#00bcd4', width: 2 } // Make lines slightly thicker
            }], {
                polar: {
                    radialaxis: {
                        visible: true,
                        range: [0, 100],
                        tickfont: {
                            size: 16, // Larger font size for radial axis
                            color: '#E0E0E0'
                        },
                        title: {
                            text: 'Occupancy (%)',
                            font: {
                                size: 20, // Add title to radial axis and make it bigger
                                color: '#E0E0E0'
                            }
                        }
                    },
                    angularaxis: {
                        tickfont: {
                            size: 16, // Larger font size for angular axis
                            color: '#E0E0E0'
                        }
                    }
                },
                title: {
                    text: 'Occupancy by Time Range',
                    font: {
                        size: 20 , // Larger title font size
                        color: '#E0E0E0'
                    }
                },
                height: 500, // Increased height
                width: 500,  // Increased width
                paper_bgcolor: '#1E1E1E',
                plot_bgcolor: '#2B2F3E'
            });


            // Plot main chart
            Plotly.newPlot(chartDiv, [{
                x: timestamps,
                y: values,
                mode: 'lines+markers',
                line: { color: '#2A9DF4', width: 4},
                marker: { size: 8, color: '#F4A261' },
            }], {
                title: {
                    text: 'Parking Occupancy Forecast for Tomorrow',
                    font: {
                        size: 28,
                        color: '#E0E0E0',
                    }
                },
                xaxis: {
                    title: {
                        text: 'Timestamp',
                        font: {
                            size: 18,
                            color: '#E0E0E0',
                        }
                    },
                    tickfont: {
                        size: 16,
                        color: '#E0E0E0',
                    },
                    showgrid: true,
                    gridcolor: '#444',
                    type: 'date',
                },
                yaxis: {
                    title: {
                        text: 'Percent Occupied (%)',
                        font: {
                            size: 18,
                            color: '#E0E0E0',
                        }
                    },
                    tickfont: {
                        size: 17,
                        color: '#E0E0E0',
                    },
                    range: [0, 1],
                    showgrid: true,
                    gridcolor: '#444',
                },
                hovermode: 'x unified',
                paper_bgcolor: '#1E1E1E',
                plot_bgcolor: '#2B2F3E',
            });

            // Display statistics
            statsDiv.innerHTML = `
                <div style="text-align: center; margin: 20px 0; font-size: 18px;">
                    <p><b>🅿️ Average Occupancy:</b> Tomorrow, parking is expected to be <b>${(values.reduce((a, b) => a + b, 0) / values.length * 100).toFixed(0)}%</b> full on average.</p>
                    <p><b>🟢 Best Time to Park:</b> The best time to find parking is <b>${timestamps[values.indexOf(Math.min(...values))].toLocaleString()}</b>, with the lowest occupancy at just <b>${(Math.min(...values) * 100).toFixed(0)}%</b>.</p>
                    <p><b>🔴 Busiest Time:</b> Parking is expected to be fullest at <b>${timestamps[values.indexOf(Math.max(...values))].toLocaleString()}</b>, reaching <b>${(Math.max(...values) * 100).toFixed(0)}%</b> occupancy.</p>
                    <p><b>📊 Median Occupancy:</b> Typically, around <b>${(values.sort((a, b) => a - b)[Math.floor(values.length / 2)] * 100).toFixed(0)}%</b> of the parking lot will be occupied.</p>
                </div>
            `;
        } catch (error) {
            showError(`An error occurred: ${error.message}`);
        } finally {
            loadingSpinner.style.display = 'none';
        }
    });

    downloadButton.addEventListener('click', () => {
        window.location.href = 'http://127.0.0.1:5020/download';
    });
});
