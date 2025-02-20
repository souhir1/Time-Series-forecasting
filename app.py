from flask import Flask, request, jsonify, render_template
import torch
import yaml
import joblib
import pandas as pd
import numpy as np
import torch.nn as nn
from flask_cors import CORS

# Initialisation du flask application
app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------------------------------
# Model architecture
# ---------------------------------------------------------------------------------------------------
class BiLSTMModel(nn.Module):
    def __init__(self, input_size, hidden_size, output_size, num_layers=2):
        super(BiLSTMModel, self).__init__()
        self.lstm = nn.LSTM(
            input_size, hidden_size, num_layers, batch_first=True, bidirectional=True
        )
        self.fc = nn.Linear(hidden_size * 2, output_size)

    def forward(self, x):
        _, (h_n, _) = self.lstm(x)
        h_n = torch.cat((h_n[-2], h_n[-1]), dim=1)
        out = self.fc(h_n)
        return out


# ---------------------------------------------------------------------------------------------------
# Scaler configuration
# ---------------------------------------------------------------------------------------------------
def prepare_inference_data(df, scaler, input_window):
    """
    Prepare raw incoming data for inference, aligning with the training data preparation steps.
    """
    df['Date_Time_HalfHour'] = pd.to_datetime(df['Date'] + ' ' + df['Time_HalfHour'])
    df.set_index('Date_Time_HalfHour', inplace=True)

    df_agg = df.groupby(df.index).agg({
        'Occupancy': 'sum',
        'Capacity': 'first',
        'DayOfWeek': 'first'
    })
    df_agg['PercentOccupied'] = df_agg['Occupancy'] / df_agg['Capacity']

    df_agg['lag_1'] = df_agg['PercentOccupied'].shift(1)
    df_agg['lag_2'] = df_agg['PercentOccupied'].shift(2)
    df_agg['lag_3'] = df_agg['PercentOccupied'].shift(3)
    df_agg['rolling_mean'] = df_agg['PercentOccupied'].rolling(window=24).mean()
    df_agg['rolling_std'] = df_agg['PercentOccupied'].rolling(window=24).std()

    df_agg.bfill(inplace=True)
    df_agg.ffill(inplace=True)

    features = ['DayOfWeek', 'PercentOccupied', 'lag_1', 'lag_2', 'lag_3', 'rolling_mean', 'rolling_std']
    scaled_features = scaler.transform(df_agg[features])
    df_scaled = pd.DataFrame(scaled_features, index=df_agg.index, columns=features)

    X = []
    timestamps = []
    for i in range(len(df_scaled) - input_window + 1):
        X.append(df_scaled.iloc[i:(i + input_window)].values)
        timestamps.append(df_scaled.index[i + input_window - 1])

    return np.array(X), pd.to_datetime(timestamps)


# Paths
config_path = r"C:/Users/Yassine/Desktop/wided/final/config.yaml"
scaler_path = r"C:/Users/Yassine/Desktop/wided/final/scaler"
checkpoint_path = r"C:/Users/Yassine/Desktop/wided/final/best.pt"

# Load configuration
with open(config_path, "r") as file:
    config = yaml.safe_load(file)

# Load and verify scaler
scaler = joblib.load(scaler_path)

# Load model and set to evaluation mode
model = BiLSTMModel(**config["hyperparameters"])
state_dict = torch.load(checkpoint_path)
model.load_state_dict(state_dict)
model.eval()

# Helper function to expand timestamps
def expand_timestamps(base_timestamps, periods):
    expanded_timestamps = []
    half_hour = pd.Timedelta(minutes=30)
    for base in base_timestamps:
        expanded_timestamps.extend([base + half_hour * i for i in range(1, periods + 1)])
    return expanded_timestamps

# Route for rendering the template
@app.route('/')
def home():
    """Render the main template."""
    return render_template('index.html')


@app.route('/predict', methods=['POST'])
def predict():
    try:
        # Get the input data
        data = request.json
        df_new = pd.DataFrame(data)

        # Preprocess data
        window_size = 96
        processed_data, timestamps = prepare_inference_data(df_new, scaler, window_size)
        inference_tensor = torch.tensor(processed_data, dtype=torch.float32)

        # Run inference
        with torch.no_grad():
            predictions = model(inference_tensor).numpy().flatten()

        # Expand timestamps and prepare results
        all_timestamps = expand_timestamps(timestamps, periods=48)
        result_df = pd.DataFrame({
            'Timestamp': all_timestamps,
            'Prediction': predictions
        })

        # Sorting the results
        result_df = result_df.sort_values(by='Timestamp').reset_index(drop=True)
        result_df = result_df.groupby('Timestamp')['Prediction'].mean().reset_index()
        result_json = result_df.to_json('predictions.json', orient='records', date_format='iso', lines=True)
        
        # Convert to JSON and return response
        # result_json = result_df.to_dict(orient='records')
        
        return jsonify(result_json)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(port=5020, host='0.0.0.0', debug=True)
